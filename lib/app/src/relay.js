// A picture fetched by an app's server for a block, when its host refuses a browser on another site (no CORS).
// The server's side of `makePictures({ relay })`: the page asks the app's own route, the route says who may ask,
// and this fetches the picture and answers it. Nothing is kept: a picture is relayed while it is shown.
//
// A server that fetches any address it is given could be turned on the machines around it, so an address is
// refused unless it is https, on the usual port, and every address its name resolves to is a public one (no
// localhost, no private network, no cloud metadata). A redirect is followed only to an address that passes the
// same checks. What comes back must be a picture, and no bigger than the most a picture may be.
//
// Server only (it resolves names): `import { relayPicture } from "@ghostmind-dev/block/server"`.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_BYTES = 5_000_000;
const TIMEOUT_MS = 8_000;
const REDIRECTS = 3;

/** Why a picture was not relayed; `status` is the HTTP status the route answers with. */
export class PictureError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const v4 = (address) => address.split(".").map(Number);
function privateV4(address) {
  const [a, b] = v4(address);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0);
}
function privateV6(address) {
  const lower = address.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return privateV4(mapped[1]);
  return lower === "::" || lower === "::1" || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || /^ff/.test(lower) || lower.startsWith("64:ff9b:") || lower.startsWith("2001:db8");
}
/** Whether an IP address is one a server must not be sent to: its own, a private network's, a link's. */
export const isPrivateAddress = (address) => (isIP(address) === 4 ? privateV4(address) : isIP(address) === 6 ? privateV6(address) : true);

/** The address, checked: https, the usual port, no credentials, and a name that resolves to public addresses only. */
async function checked(address, resolve) {
  let url;
  try {
    url = new URL(address);
  } catch {
    throw new PictureError(400, `${address} is not an address`);
  }
  if (url.protocol !== "https:") throw new PictureError(400, `${address} is not an https address`);
  if (url.username || url.password) throw new PictureError(400, "an address with a user or a password is not relayed");
  if (url.port && url.port !== "443") throw new PictureError(400, "only the usual https port is relayed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await resolve(host, { all: true }).catch(() => [])).map((each) => each.address);
  if (!addresses.length) throw new PictureError(502, `${url.hostname} does not resolve`);
  if (addresses.some(isPrivateAddress)) throw new PictureError(403, `${url.hostname} is not a public address`);
  return url;
}

/**
 * Fetches a picture for a block, with the checks above.
 * @param {string} address the picture's address, as the block wrote it
 * @param {{ fetch?: typeof fetch, maxBytes?: number, timeout?: number, resolve?: typeof lookup }} [options]
 * @returns {Promise<{ type: string, bytes: Uint8Array }>}
 * @throws {PictureError}
 */
export async function relayPicture(address, { fetch: get = globalThis.fetch, maxBytes = MAX_BYTES, timeout = TIMEOUT_MS, resolve = lookup } = {}) {
  const signal = AbortSignal.timeout(timeout);
  let url = await checked(address, resolve);
  let response;
  for (let hop = 0; ; hop++) {
    try {
      response = await get(url, { redirect: "manual", signal, headers: { accept: "image/*" } });
    } catch (error) {
      throw new PictureError(502, `${url.hostname} did not answer: ${error.message}`);
    }
    if (response.status < 300 || response.status >= 400) break;
    const next = response.headers.get("location");
    if (!next || hop >= REDIRECTS) throw new PictureError(502, `${url.hostname} sends the picture elsewhere too many times`);
    url = await checked(new URL(next, url).href, resolve);
  }
  if (!response.ok) throw new PictureError(502, `${url.hostname} answered ${response.status}`);
  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!type.startsWith("image/")) throw new PictureError(415, `${address} is not a picture (${type || "no type"})`);
  if (Number(response.headers.get("content-length") ?? 0) > maxBytes) throw new PictureError(413, `the picture is more than ${maxBytes} bytes`);
  // read it as it comes, and stop at the most a picture may be
  const parts = [];
  let size = 0;
  for await (const part of response.body ?? []) {
    size += part.length;
    if (size > maxBytes) throw new PictureError(413, `the picture is more than ${maxBytes} bytes`);
    parts.push(part);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const part of parts) bytes.set(part, (at += part.length) - part.length);
  return { type, bytes };
}
