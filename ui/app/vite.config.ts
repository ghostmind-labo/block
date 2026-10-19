import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

// In dev the package is lib/ as it is on disk (a link, ../docker/Dockerfile), outside this app's folder, which is
// all the watcher sees: a change to lib/ synced into the pod was never noticed, and pages kept an old copy of it
// (an export missing until a hard reload). Watched too, a change to it reloads the page like one of the app's own.
const LIB = fileURLToPath(new URL("../../lib/app/src", import.meta.url));
const watchLib = (): Plugin => ({
  name: "watch-lib",
  apply: "serve",
  configureServer(server) {
    // And a file of lib/ is always sent whole and transformed again: a page never keeps a copy from before a sync
    // (a "not modified" for a module the watcher had not seen change yet). The package is a few small files.
    // Every file of the page is sent no-store: the tunnel's Cloudflare otherwise adds max-age=14400, and the
    // browser kept an old stylesheet or an old package for hours. What the server answers (/api…) keeps its own.
    server.middlewares.use((req, res, next) => {
      const path = decodeURIComponent((req.url ?? "").split("?")[0]);
      if (!/^\/(?:api|mcp|oauth|\.well-known)(?:\/|$)/.test(path)) {
        // vite sets its own no-cache after this, which Cloudflare replaces: keep ours
        const set = res.setHeader.bind(res);
        res.setHeader = (name, value) => set(name, name.toLowerCase() === "cache-control" ? "no-store" : value);
        res.setHeader("Cache-Control", "no-store");
      }
      if (path.startsWith(`/@fs${LIB}`)) {
        delete req.headers["if-none-match"];
        const module = server.moduleGraph.getModuleById(path.slice("/@fs".length));
        if (module) server.moduleGraph.invalidateModule(module);
      }
      next();
    });
    server.watcher.add(LIB);
    server.watcher.on("change", (file) => {
      if (!file.startsWith(LIB)) return;
      server.moduleGraph.invalidateAll();
      server.ws.send({ type: "full-reload" });
    });
  },
});

// The web app and the block server are one host. The tunnel sends the server's paths to it, in dev and in
// prod; this proxy does the same for someone reaching the web app directly (localhost:5106, the pod).
const server = process.env.MCP_URL ?? "http://localhost:3105";

// A shared block's address, pasted in X, iMessage or Slack, shows a card: its name and what it is. The link
// previewers read the page's tags without running it, so the page server writes them into /b/<id> itself.
const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const blockCard = (): Plugin => {
  const tagged = async (url: string, host: string | undefined, proto: string | undefined, html: string) => {
    const id = /^\/b\/([0-9a-f-]{36})\/?(?:\?.*)?$/i.exec(url)?.[1];
    if (!id) return html;
    const block = await fetch(`${server}/api/blocks/${id}`)
      .then((answer) => (answer.ok ? (answer.json() as Promise<{ name: string; shared?: boolean }>) : null))
      .catch(() => null);
    if (!block?.shared) return html;
    const origin = `${proto ?? "https"}://${host ?? "block.ghostmind.dev"}`;
    const name = esc(block.name);
    const description = "A live html block: open it to see it move.";
    const tags = [
      `<title>${name}</title>`,
      `<meta name="description" content="${description}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="block" />`,
      `<meta property="og:title" content="${name}" />`,
      `<meta property="og:description" content="${description}" />`,
      `<meta property="og:url" content="${origin}/b/${id}" />`,
      `<meta name="twitter:card" content="summary" />`,
      `<meta name="twitter:title" content="${name}" />`,
      `<meta name="twitter:description" content="${description}" />`,
    ].join("\n    ");
    return html.replace(/<title>[^<]*<\/title>/, tags);
  };
  const forBlocks = (read: (url: string) => Promise<string>) => (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ?? "";
    if (req.method !== "GET" || !url.startsWith("/b/")) return next();
    const proto = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0] || undefined;
    read(url)
      .then((html) => tagged(url, req.headers.host, proto, html))
      .then((html) => {
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(html);
      })
      .catch(next);
  };
  return {
    name: "block-card",
    configureServer(dev) {
      dev.middlewares.use(forBlocks(async (url) => dev.transformIndexHtml(url, await readFile(fileURLToPath(new URL("index.html", import.meta.url)), "utf8"))));
    },
    configurePreviewServer(preview) {
      preview.middlewares.use(forBlocks(() => readFile(fileURLToPath(new URL("dist/index.html", import.meta.url)), "utf8")));
    },
  };
};
const proxy = Object.fromEntries(["/mcp", "/oauth", "/.well-known", "/api"].map((path) => [path, { target: server, changeOrigin: false }]));

export default defineConfig({
  plugins: [react(), watchLib(), blockCard()],
  // allowedHosts: the dev tunnel reaches this server under its public name
  server: { proxy, allowedHosts: true, fs: { allow: ["../.."] }, watch: { usePolling: true } },
  preview: { proxy, allowedHosts: true },
});
