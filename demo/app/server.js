// The demo page's server: its own files, and the package's source as it is on disk under /block/,
// so the page imports exactly what is being edited. No dependency, no build.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOTS = { "/block/": resolve(HERE, "../../lib/app/src"), "/": resolve(HERE, "public") };
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
const PORT = Number(process.env.PORT);
if (!PORT) throw new Error("PORT is not set: start through varlock (run routine dev)");

createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://x").pathname);
  const prefix = path.startsWith("/block/") ? "/block/" : "/";
  const root = ROOTS[prefix];
  const file = normalize(join(root, path.slice(prefix.length) || "index.html"));
  // Nothing outside the two folders is ever read.
  if (!file.startsWith(root)) return response.writeHead(403).end();
  try {
    const body = await readFile(file);
    response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" }).end(body);
  } catch {
    response.writeHead(404).end("not found");
  }
}).listen(PORT, () => console.log(`block demo on http://localhost:${PORT}`));
