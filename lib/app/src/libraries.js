// The libraries a block may ask for, and how one is brought to it.
//
// A block's frame reaches no network, so it cannot load a script from anywhere. It names what it needs on
// its first lines (`<!-- block:use chart.js@4 -->`), the app fetches that library's text where the network is
// ordinary, and writes it into the block's document. The frame never learns an address.
//
// Any package on npm may be named. The frame is what keeps a block in, not a list of names: a library runs
// in the same sandbox as the block that asked for it and reaches exactly as little. The catalogue is what was
// LEARNED about some of them (which file to take, the global it makes, what goes wrong in a frame), not a gate.
//
//   - A library of the catalogue is brought as the catalogue says: a classic script that makes its global.
//   - Any other is brought as the module jsDelivr builds for it (`/npm/<name>@<version>/+esm`: one file per
//     package, its own files bundled, its dependencies imported from the same place). A frame cannot `import`
//     from an address, so each module is rewritten as a classic script that keeps its exports in a registry
//     of the frame, and the library is given to the block as a global, like the others.
//
// Nothing is cached here on purpose. The files come from a public CDN whose job that is: an exact version
// never changes and is kept by the CDN and by the browser for as long as they like, and a range ("4",
// "latest") is refreshed by the CDN on its own schedule. The only thing kept is a request in flight, so two
// blocks that want the same file at the same moment make one request. An app that would rather not let a
// reader's browser call the CDN gives its own `fetch` (one that goes through its server) and nothing else changes.
//
// A request only ever goes to the CDN, for a name, a version and a path that were each checked before they
// were written into its address.

import CATALOGUE from "./catalogue.js";

const CDN = "https://cdn.jsdelivr.net";
const MAX_BYTES = 1_500_000;

/** A version goes straight into a path: range characters and dots only, no slash, no "..". */
export const validVersion = (v) => typeof v === "string" && v.length <= 32 && /^[\^~]?[a-zA-Z0-9][a-zA-Z0-9.\-+^~*]*$/.test(v) && !v.includes("..");

/** The version to write for the one that was tested: its major from 1.0 on, its minor below. */
export const pin = (v) => (Number(v.split(".")[0]) >= 1 || !v.includes(".") ? v.split(".")[0] : v.split(".").slice(0, 2).join("."));

const base64 = (bytes) => {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
};

/**
 * What an author reads to choose: every library in a few words, or one of them with what was learned.
 * @param {string} [name]
 * @param {{ catalogue?: object, directive?: string }} [options] `directive` is the app's own spelling ("relay", "potion")
 */
export function describe(name, { catalogue = CATALOGUE, directive = "block" } = {}) {
  const one = ([key, entry]) => ({
    name: key,
    global: entry.global,
    category: entry.category,
    summary: entry.summary,
    when: entry.when,
    use: `<!-- ${directive}:use ${key}@${entry.tested ? pin(entry.tested) : "<version>"} -->`,
    kind: entry.module || entry.builds.length ? "code" : "styles",
  });
  if (name == null) return { libraries: Object.entries(catalogue).map(one), any: ANY(directive) };
  const key = String(name).toLowerCase();
  const entry = catalogue[key];
  if (!entry) return null;
  return { library: { ...one([key, entry]), styled: Boolean(entry.styles?.length), sandbox: entry.sandbox ?? [] } };
}

// What is said of the packages the catalogue does not hold.
const ANY = (directive) =>
  `Any other package on npm may be named the same way: <!-- ${directive}:use <name>@<version> -->, or a file of one: <name>@<version>/<path>.js, <name>@<version>/<path>.css. It arrives as a global, never by import: the name the block gives it (<name>@<version> as myName), or the package's name in camelCase (canvas-confetti is canvasConfetti). The global is the package's default export when it has one, all its exports otherwise. A file of a package the block also names joins that package's global. Nothing was tried for these in a frame: a package that needs the network, storage or eval will not work.`;

export class LibraryError extends Error {}

const NAME = /^(?:@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*$/;
const FILE = /^(?:\/[A-Za-z0-9._@+-]+)+$/;
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const MODULE = String.raw`\/npm\/[^"'\s]+?\/\+esm`;
const MAX_MODULES = 80;
const MAX_MODULE_BYTES = 6_000_000;

const camel = (text) => text.replace(/[^A-Za-z0-9_$]+(.)?/g, (_all, next) => (next ? next.toUpperCase() : "")).replace(/^[0-9]/, "_$&");

/** The global a library is given as when neither the block nor the catalogue names one. */
export const globalOf = (name, path) => camel(path ? path.split("/").pop().replace(/\.[a-z]+$/i, "") : name.split("/").pop()) || "library";

// `a as b, c` of an import or an export, as [a, b] pairs. Names that are not identifiers are left out.
const pairs = (list) =>
  list
    .split(",")
    .map((part) => part.trim().split(/\s+as\s+/))
    .filter((pair) => pair[0] && pair.every((name) => IDENTIFIER.test(name)))
    .map(([from, to = from]) => [from, to]);

// What an import statement binds, as a `const`.
function bindings(clause, module) {
  const out = [];
  let rest = clause.trim();
  const first = /^([A-Za-z_$][\w$]*)\s*,?\s*/.exec(rest);
  if (first) {
    out.push(`${first[1]}=${module}.default`);
    rest = rest.slice(first[0].length);
  }
  const all = /^\*\s*as\s+([A-Za-z_$][\w$]*)/.exec(rest);
  if (all) out.push(`${all[1]}=${module}`);
  const some = /^\{([^{}]*)\}/.exec(rest);
  if (some && some[1].trim()) out.push(`{${pairs(some[1]).map(([from, to]) => (from === to ? from : `${from}:${to}`)).join(",")}}=${module}`);
  return out.length ? `const ${out.join(",")};` : "";
}

/**
 * One module as jsDelivr builds it, rewritten as a classic script. Its imports are at its start and its
 * exports at its end, always in the same few forms (it is the output of a bundler), so they are read there
 * and nowhere else: nothing inside the library's own code is touched.
 * @param {string} text
 * @returns {{ code: string, needs: string[], exports: string[] }} `code` reads the registry as `$$m` and leaves its exports in `$$e`
 */
export function classicOf(text) {
  const needs = [];
  const need = (path) => (needs.includes(path) || needs.push(path), `$$m[${JSON.stringify(path)}]`);
  const head = [];
  const getters = [];
  const stars = [];
  const exports = [];
  const give = (name, value) => (exports.push(name), getters.push(`get ${name}(){return ${value}}`));

  let rest = String(text).replace(/\s*\/\/# sourceMappingURL=\S*\s*$/, "");
  for (;;) {
    rest = rest.replace(/^(?:\s+|\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)+/, "");
    let found;
    if ((found = new RegExp(`^import\\s*(["'])(${MODULE})\\1;?`).exec(rest))) need(found[2]);
    else if ((found = new RegExp(`^import\\s*([^"';]+?)\\s*from\\s*(["'])(${MODULE})\\2;?`).exec(rest))) head.push(bindings(found[1], need(found[3])));
    else if ((found = new RegExp(`^export\\s*\\*\\s*as\\s+([A-Za-z_$][\\w$]*)\\s*from\\s*(["'])(${MODULE})\\2;?`).exec(rest))) give(found[1], need(found[3]));
    else if ((found = new RegExp(`^export\\s*\\*\\s*from\\s*(["'])(${MODULE})\\1;?`).exec(rest))) stars.push(need(found[2]));
    else if ((found = new RegExp(`^export\\s*\\{([^{}]*)\\}\\s*from\\s*(["'])(${MODULE})\\2;?`).exec(rest))) {
      const module = need(found[3]);
      for (const [from, to] of pairs(found[1])) give(to, `${module}.${from}`);
    } else break;
    rest = rest.slice(found[0].length);
  }
  const other = /^(?:import\s*(?:["'{*]|[\w$]+\s*(?:,|from\b))|export\s*[*{][^;]*?from)[^;]{0,200}/.exec(rest);
  if (other) throw new LibraryError(`imports something that is not a package on npm (${other[0].slice(0, 80)})`);

  for (;;) {
    rest = rest.replace(/[\s;]+$/, "");
    const clause = /(?:^|[;}\s)])export\s*\{([^{}]*)\}$/.exec(rest);
    if (!clause) break;
    for (const [from, to] of pairs(clause[1])) give(to, from);
    rest = rest.slice(0, clause.index + (rest[clause.index] === "e" ? 0 : 1));
  }
  const byDefault = rest.lastIndexOf("export default ");
  if (!exports.includes("default") && byDefault >= 0 && (byDefault === 0 || /[;}\s)]/.test(rest[byDefault - 1]))) {
    rest = `${rest.slice(0, byDefault)}var $$d=${rest.slice(byDefault + "export default ".length)}`;
    give("default", "$$d");
  }
  // A dependency asked for only when it is needed is brought with the others, and handed over as a promise.
  rest = rest.replace(new RegExp(`\\bimport\\(\\s*(["'])(${MODULE})\\1\\s*\\)`, "g"), (_all, _quote, path) => `Promise.resolve(${need(path)})`);
  // A classic script has no address of its own to give.
  rest = rest.replace(/\bimport\.meta\b/g, '({url:"about:blank"})');

  const star = stars.map((module) => `Object.keys(${module}).forEach(function(k){if(k!=="default"&&!(k in $$e))Object.defineProperty($$e,k,{enumerable:true,get:function(){return ${module}[k]}})});`).join("");
  return { code: `${head.join("")}${rest}\n;var $$e={${getters.join(",")}};${star}`, needs, exports };
}

/**
 * @param {{ catalogue?: object, fetch?: typeof fetch, cdn?: string }} [options]
 */
export function makeLoader({ catalogue = CATALOGUE, fetch: get = globalThis.fetch, cdn = CDN } = {}) {
  const asked = new Map(); // what is being fetched right now -> its request

  const once = (key, start) => {
    if (!asked.has(key)) asked.set(key, start().finally(() => asked.delete(key)));
    return asked.get(key);
  };

  // One file of the CDN, or null when it is not there.
  const file = (path, as = "text") =>
    once(`${as} ${path}`, async () => {
      const response = await get(`${cdn}${path}`, { redirect: "follow" }).catch(() => null);
      if (!response?.ok) return null;
      const body = as === "text" ? await response.text() : new Uint8Array(await response.arrayBuffer());
      if (body.length > MAX_BYTES) throw new LibraryError("is too large to be given to a block");
      return body;
    });

  // The first of the paths that exists for this version.
  async function first(pkg, version, paths, as = "text") {
    for (const path of paths) {
      const body = await file(`/npm/${pkg}@${encodeURIComponent(version)}/${path}`, as);
      if (body != null) return body;
    }
    return null;
  }

  async function fetchOne(name, version) {
    const entry = catalogue[name];
    const source = entry.builds.length ? await first(entry.pkg, version, entry.builds) : "";
    if (source == null) throw new LibraryError("was not found: check that this version exists on npm");
    const sheets = [];
    // A library that needs its stylesheet is not given without it: it would run and look broken.
    if (entry.styles?.length) {
      const sheet = await first(entry.pkg, version, entry.styles);
      if (sheet == null) throw new LibraryError("was found, but not its stylesheet: try another version");
      sheets.push(sheet);
    }
    // A font is carried in as data: the only source a block's fonts may have.
    for (const item of entry.fonts?.files ?? []) {
      const bytes = await first(entry.pkg, version, [item.path], "bytes");
      if (bytes == null) throw new LibraryError("was found, but not its font files: try another version");
      sheets.push(`@font-face{font-family:'${entry.fonts.family}';font-style:${item.style ?? "normal"};font-weight:${item.weight};font-display:block;src:url(data:font/woff2;base64,${base64(bytes)}) format('woff2')}`);
    }
    const styles = sheets.join("\n");
    return { name, version, global: entry.global, source, ...(styles ? { styles } : {}) };
  }

  const named = (error, key) => (error instanceof LibraryError ? new LibraryError(`${key} ${error.message}`) : new LibraryError(`${key} could not be fetched just now: ${error.message}`));

  /** A library of the catalogue that is a classic script, a stylesheet or a font. */
  async function load(rawName, version) {
    const name = String(rawName ?? "").toLowerCase();
    if (!Object.hasOwn(catalogue, name)) throw new LibraryError(`no library is called "${name}"`);
    if (!validVersion(version)) throw new LibraryError(`"${version}" is not a version: write ${name}@${catalogue[name].tested ? pin(catalogue[name].tested) : "1"}`);
    const key = `${name}@${version}`;
    return once(`library ${key}`, () =>
      fetchOne(name, version).catch((error) => {
        throw named(error, key);
      }),
    );
  }

  // One module and the exact version it turned out to be. jsDelivr writes the file it built from on the
  // first lines, which is where a range ("0.180", "latest") becomes a version.
  async function moduleAt(path) {
    const text = await file(path);
    if (text == null) return null;
    const built = /Original file: \/npm\/(?:@[^/\s]+\/)?[^@/\s]+@([^/\s]+)\//.exec(text.slice(0, 600));
    const id = built ? path.replace(/^(\/npm\/(?:@[^/]+\/)?[^@/]+@)[^/]+/, `$1${built[1]}`) : path;
    return { id, version: built?.[1], ...classicOf(text), bytes: text.length };
  }

  /**
   * Every library of a block, in the order it named them, and a line for each one that could not be brought.
   * A module that two of them need (three, and a control written for three) is brought and run once.
   * @param {{ name: string, version: string, path?: string, as?: string }[]} list
   * @returns {Promise<{ libraries: (import("./document.js").LoadedLibrary & { global?: string, exports?: string[] })[], problems: string[] }>}
   */
  async function loadAll(list) {
    const modules = new Map(); // id -> the module
    const ids = new Map(); // every path a module was asked by -> its id
    const written = new Set(); // ids already in an earlier library's script
    const globals = new Map(); // package -> the global it was given as
    let bytes = 0;

    async function bring(path) {
      if (ids.has(path)) return ids.get(path);
      if (modules.has(path)) return path; // asked by its exact version, which is what it is kept under
      const module = await moduleAt(path);
      if (!module) throw new LibraryError(`needs ${path.replace(/^\/npm\/|\/\+esm$/g, "")}, which was not found`);
      ids.set(path, module.id);
      if (!modules.has(module.id)) {
        if (modules.size >= MAX_MODULES || (bytes += module.bytes) > MAX_MODULE_BYTES) throw new LibraryError("is too large to be given to a block: it brings too many files with it");
        modules.set(module.id, { ...module, asked: new Set([module.id]) });
      }
      modules.get(module.id).asked.add(path);
      return module.id;
    }

    // Everything a module needs, before it, each once.
    async function order(id, out = [], seen = new Set()) {
      if (seen.has(id)) return out;
      seen.add(id);
      const needs = await Promise.all(modules.get(id).needs.map(bring));
      for (const need of needs) await order(need, out, seen);
      out.push(id);
      return out;
    }

    const wrap = (id) => {
      const module = modules.get(id);
      return `(function($$m){"use strict";${module.code}${[...module.asked].map((path) => `$$m[${JSON.stringify(path)}]=`).join("")}$$e;})(window.__blockModules||(window.__blockModules={}));`;
    };

    async function one(library) {
      const name = String(library.name ?? "").toLowerCase();
      const { version, path } = library;
      const entry = Object.hasOwn(catalogue, name) ? catalogue[name] : null;
      const spec = `${name}@${version}${path ?? ""}`;
      if (library.as != null && !IDENTIFIER.test(library.as)) throw new LibraryError(`${spec}: "${library.as}" cannot be the name of a global`);
      if (entry && !entry.module && !path) {
        const classic = await load(name, version);
        return library.as && classic.source ? { ...classic, global: library.as, source: `${classic.source}\n;window[${JSON.stringify(library.as)}]=window[${JSON.stringify(classic.global)}];` } : classic;
      }
      if (!NAME.test(name)) throw new LibraryError(`no library is called "${name}"`);
      if (!validVersion(version)) throw new LibraryError(`"${version}" is not a version: write ${name}@${entry?.tested ? pin(entry.tested) : "1"}`);
      if (path && (!FILE.test(path) || path.includes(".."))) throw new LibraryError(`${spec}: "${path}" is not a file of a package`);
      const pkg = entry?.pkg ?? name;
      try {
        if (path?.endsWith(".css")) {
          const styles = await file(`/npm/${pkg}@${encodeURIComponent(version)}${path}`);
          if (styles == null) throw new LibraryError("was not found: check the path and the version on npm");
          return { name, version, path, styles };
        }
        // A path as the package's documentation writes it, where its files are somewhere else (three/addons/).
        const real = path ? Object.entries(entry?.aliases ?? {}).reduce((at, [from, to]) => (at.startsWith(from) ? to + at.slice(from.length) : at), path) : "";
        const id = await bring(`/npm/${pkg}@${encodeURIComponent(version)}${real}/+esm`).catch((error) => {
          throw /which was not found$/.test(error.message) ? new LibraryError(path ? "was not found: check the path and the version on npm" : "was not found: check the name and the version on npm") : error;
        });
        const run = (await order(id)).filter((each) => !written.has(each));
        run.forEach((each) => written.add(each));
        // A file of a package the block also named joins that package's global (THREE.OrbitControls).
        const joins = path && !library.as ? globals.get(name) : null;
        const global = library.as ?? joins ?? (path ? globalOf(name, path) : entry?.global ?? globalOf(name));
        if (!path) globals.set(name, global);
        const give = joins
          ? `(function(m,t){if(!t)return;Object.keys(m).forEach(function(k){if(k!=="default"&&!(k in t))try{t[k]=m[k]}catch(_){}})})(window.__blockModules[${JSON.stringify(id)}],window[${JSON.stringify(global)}]);`
          : // What a classic build would have made its global: the default export when there is one, every export otherwise.
            `(function(m){var d=m.default;window[${JSON.stringify(global)}]=d&&(typeof d==="function"||typeof d==="object")?d:m})(window.__blockModules[${JSON.stringify(id)}]);`;
        const main = modules.get(id);
        return { name, version: main.version ?? version, ...(path ? { path } : {}), global, kind: "module", exports: main.exports, source: `${run.map(wrap).join("\n")}\n${give}` };
      } catch (error) {
        throw named(error, spec);
      }
    }

    // One after the other, so that what the first brought is not brought again by the second.
    const libraries = [];
    const problems = [];
    const classic = list.map((library) => {
      const name = String(library.name ?? "").toLowerCase();
      return Object.hasOwn(catalogue, name) && !catalogue[name].module && !library.path ? one(library).then((value) => ({ value }), (reason) => ({ reason })) : null;
    });
    for (const [index, library] of list.entries()) {
      const settled = classic[index] ? await classic[index] : await one(library).then((value) => ({ value }), (reason) => ({ reason }));
      if (settled.reason) problems.push(settled.reason.message);
      else {
        libraries.push(settled.value);
        if (classic[index]) globals.set(settled.value.name, settled.value.global);
      }
    }
    return { libraries, problems };
  }

  return { load, loadAll };
}
