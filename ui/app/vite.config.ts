import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The web app and the block server are one host. The tunnel sends the server's paths to it, in dev and in
// prod; this proxy does the same for someone reaching the web app directly (localhost:5106, the pod).
const server = process.env.MCP_URL ?? "http://localhost:3105";
const proxy = Object.fromEntries(["/mcp", "/oauth", "/.well-known", "/api"].map((path) => [path, { target: server, changeOrigin: false }]));

export default defineConfig({
  plugins: [react()],
  // allowedHosts: the dev tunnel reaches this server under its public name
  server: { proxy, allowedHosts: true, fs: { allow: ["../.."] }, watch: { usePolling: true } },
  preview: { proxy, allowedHosts: true },
});
