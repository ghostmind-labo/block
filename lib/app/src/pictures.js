// The pictures a block shows by address, and how one is brought to it.
//
// A block's frame loads nothing: its policy takes pictures from `data:` only, so a script cannot send what it
// knows out in the address of an image. A person still pastes the address of a picture (`<img src="https://…">`),
// and it should show. So the app brings it, as it brings a library: before the frame is made, each address
// WRITTEN in the source is fetched where the network is ordinary, and written back into the source as a `data:`
// address. The frame's policy does not change: an address a script makes at run time is still refused, and the
// addresses fetched are only the ones anyone can read in the block.
//
// Only `<img src>` is brought. A font, a frame, a video or a css `url()` by address is not: the check says so.
//
// The page fetches a picture straight from its host. A host that refuses a browser on another site (no CORS) is
// asked again through the app's own server, when the app gives a `relay` (its route calls `relayPicture`, from
// "@ghostmind-dev/block/server"). Nothing is cached here; the only thing kept is a request in flight, so one
// picture shown twice at the same moment is asked for once.

const MAX_BYTES = 5_000_000;
// a block waits for its pictures before it is drawn: a host that does not answer is given up on
const TIMEOUT_MS = 6_000;

// `<img … src="https://…">`, `src='…'` or `src=https://…`, as written (an `&` may be written `&amp;`).
const IMG_SRC = /<img\b[^>]*?\ssrc\s*=\s*(?:"(https:\/\/[^"]+)"|'(https:\/\/[^']+)'|(https:\/\/[^\s>"']+))/gi;
const unescape = (text) => text.replace(/&amp;/g, "&").replace(/&#38;/g, "&").replace(/&quot;/g, '"');

/**
 * The addresses of the pictures a block shows with `<img src="https://…">`, as they are written in it.
 * @param {string} source
 * @returns {string[]} each address once, `&amp;` read as `&`
 */
export function picturesIn(source) {
  const found = new Set();
  for (const match of String(source ?? "").matchAll(IMG_SRC)) found.add(unescape(match[1] ?? match[2] ?? match[3]));
  return [...found];
}

const base64Of = (bytes) => {
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
};

/**
 * What brings a picture to a block: `bring(address)` answers it as a `data:` address.
 * @param {{ fetch?: (address: string) => Promise<Response>, relay?: (address: string) => Promise<Response>, maxBytes?: number }} [options]
 *   `fetch` asks the picture's host (the page's own fetch, by default); `relay`, when the host refused, asks the
 *   app's server for it (e.g. `fetch("/api/picture?url=" + encodeURIComponent(address))`)
 */
export function makePictures({ fetch: get = (address) => globalThis.fetch(address, { credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(TIMEOUT_MS) }), relay, maxBytes = MAX_BYTES } = {}) {
  const asked = new Map();
  async function fetchOne(address) {
    let response;
    try {
      response = await get(address);
    } catch (error) {
      // refused by the browser (the host does not answer other sites), or no answer: the app's server, if it relays
      if (!relay) throw new Error(`${address} could not be fetched from this page (${error.message})`);
      response = await relay(address);
      if (!response.ok) {
        const said = await response.json().catch(() => null);
        throw new Error(said?.message ?? `${address}: the app's server answered ${response.status}`);
      }
    }
    if (!response.ok) throw new Error(`${address} answered ${response.status}`);
    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!type.startsWith("image/")) throw new Error(`${address} is not a picture (${type || "no type"})`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > maxBytes) throw new Error(`${address} is ${bytes.length} bytes; a picture is ${maxBytes} at most`);
    return `data:${type};base64,${base64Of(bytes)}`;
  }
  /** @param {string} address @returns {Promise<string>} */
  function bring(address) {
    if (!/^https:\/\//i.test(address)) return Promise.reject(new Error(`${address} is not an https address`));
    if (!asked.has(address)) asked.set(address, fetchOne(address).finally(() => asked.delete(address)));
    return asked.get(address);
  }
  return { bring };
}

/**
 * The source with every picture it shows by address brought in as `data:`. A picture that could not be brought
 * is left out (an empty `src`, so nothing is fetched and the block's own fallback shows), and said.
 * @param {string} source
 * @param {{ bring: (address: string) => Promise<string> } | undefined} pictures what `makePictures` made; none: every picture is left out
 * @returns {Promise<{ source: string, problems: string[] }>}
 */
export async function bringPictures(source, pictures) {
  const text = String(source ?? "");
  const addresses = picturesIn(text);
  if (!addresses.length) return { source: text, problems: [] };
  const brought = new Map();
  const problems = [];
  await Promise.all(
    addresses.map(async (address) => {
      try {
        if (!pictures) throw new Error("this page brings no pictures");
        brought.set(address, await pictures.bring(address));
      } catch (error) {
        problems.push(`a picture could not be brought: ${error.message}`);
      }
    }),
  );
  const out = text.replace(IMG_SRC, (whole, double, single, bare) => {
    const written = double ?? single ?? bare;
    const data = brought.get(unescape(written)) ?? "";
    return whole.replace(written, data);
  });
  return { source: out, problems };
}
