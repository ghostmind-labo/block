import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { COLORS_OPTIONS, COLORS_OVERRIDE_KEY } from "./src/colors-options.ts";

// The web app and the block server are one host. The tunnel sends the server's paths to it, in dev and in
// prod; this proxy does the same for someone reaching the web app directly (localhost:5106, the pod).
const server = process.env.MCP_URL ?? "http://localhost:3105";
const proxy = Object.fromEntries(["/mcp", "/oauth", "/.well-known", "/api"].map((path) => [path, { target: server, changeOrigin: false }]));

// @ghostmind-dev/colors (ui/.env.schema). COLORS_PACKAGE: on or off for every browser; in dev a browser's own
// choice (the pill, localStorage) wins. COLORS_SOURCE=local: the copy in src/colors-local made by
// scripts/colors-local.sh, when it is there; npm otherwise.
const dev = process.env.APP_ENV !== "prod";
const packageOn = (process.env.COLORS_PACKAGE ?? "on") === "on";
const localDir = path.resolve(import.meta.dirname, "src/colors-local");
const colorsLocal = process.env.COLORS_SOURCE === "local" && fs.existsSync(path.join(localDir, "app.js"));
if (colorsLocal) console.log("colors: @ghostmind-dev/colors from src/colors-local");
const alias = colorsLocal
  ? [
      { find: /^@ghostmind-dev\/colors$/, replacement: path.join(localDir, "index.js") },
      { find: /^@ghostmind-dev\/colors\/(.*)$/, replacement: path.join(localDir, "$1.js") },
    ]
  : [];

/**
 * Writes the package's stylesheet and pre-paint script into index.html, so the theme is set before the first
 * paint (a module script runs after the page has been parsed, and in dev after many requests: too late).
 * Off and not dev: only <html data-colors="block">, nothing else. In dev the script decides per browser.
 */
function colorsPage(): Plugin {
  let devServer: ViteDevServer | undefined;
  const load = async () => {
    const id = colorsLocal ? path.join(localDir, "app.js") : "@ghostmind-dev/colors/app";
    // In dev through Vite's module graph, so a new copy in src/colors-local is read on the next page load.
    const mod = devServer ? await devServer.ssrLoadModule(id) : await import(colorsLocal ? pathToFileURL(id).href : id);
    return (mod as typeof import("@ghostmind-dev/colors/app")).createColors(COLORS_OPTIONS);
  };
  return {
    name: "colors-page",
    configureServer(s) {
      devServer = s;
    },
    async transformIndexHtml(html) {
      if (!dev && !packageOn) return html.replace("<html ", '<html data-colors="block" ');
      const colors = await load();
      const css = colors.css() + "\n" + fs.readFileSync(path.resolve(import.meta.dirname, "src/colors-map.css"), "utf8");
      const js = (s: string) => JSON.stringify(s).replace(/</g, "\\u003c");
      const script = dev
        ? `(function(){var d=document.documentElement,m=${js(packageOn ? "on" : "off")};` +
          `try{var o=localStorage.getItem(${js(COLORS_OVERRIDE_KEY)});if(o==="on"||o==="off")m=o}catch(e){}` +
          `d.dataset.colors=m==="on"?"package":"block";if(m!=="on")return;` +
          `var st=document.createElement("style");st.id="colors-package";st.textContent=${js(css)};document.head.appendChild(st);` +
          `${colors.prepaint()}})()`
        : `document.documentElement.dataset.colors="package";${colors.prepaint()}`;
      return {
        html,
        tags: [
          ...(dev ? [] : [{ tag: "style", attrs: { id: "colors-package" }, children: css, injectTo: "head" as const }]),
          { tag: "script", children: script, injectTo: "head" as const },
        ],
      };
    },
  };
}

export default defineConfig({
  plugins: [react(), colorsPage()],
  define: { __COLORS_DEV__: JSON.stringify(dev) },
  resolve: { alias },
  // allowedHosts: the dev tunnel reaches this server under its public name
  server: { proxy, allowedHosts: true, fs: { allow: ["../.."] }, watch: { usePolling: true } },
  preview: { proxy, allowedHosts: true },
});
