import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The web app and the block server are one host. Here the dev server sends the server's paths on; in prod the
// tunnel does, and this proxy only matters to someone reaching the pod directly.
const server = process.env.MCP_URL ?? "http://localhost:3105";
const proxy = Object.fromEntries(["/mcp", "/oauth", "/.well-known", "/api"].map((path) => [path, { target: server, changeOrigin: false }]));

export default defineConfig({
  plugins: [react()],
  // lib/ is beside this app, outside its folder: the package is read as source.
  server: { proxy, fs: { allow: ["../.."] }, watch: { usePolling: true } },
  preview: { proxy, allowedHosts: true },
});
