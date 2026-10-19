import react from "@vitejs/plugin-react";
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
    // no-store, because the tunnel's Cloudflare otherwise adds max-age=14400 and the browser keeps a stale copy.
    server.middlewares.use((req, res, next) => {
      const path = decodeURIComponent((req.url ?? "").split("?")[0]);
      if (path.startsWith(`/@fs${LIB}`)) {
        delete req.headers["if-none-match"];
        // vite sets its own no-cache after this, which Cloudflare replaces: keep ours
        const set = res.setHeader.bind(res);
        res.setHeader = (name, value) => set(name, name.toLowerCase() === "cache-control" ? "no-store" : value);
        res.setHeader("Cache-Control", "no-store");
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
const proxy = Object.fromEntries(["/mcp", "/oauth", "/.well-known", "/api"].map((path) => [path, { target: server, changeOrigin: false }]));

export default defineConfig({
  plugins: [react(), watchLib()],
  // allowedHosts: the dev tunnel reaches this server under its public name
  server: { proxy, allowedHosts: true, fs: { allow: ["../.."] }, watch: { usePolling: true } },
  preview: { proxy, allowedHosts: true },
});
