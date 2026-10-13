// The first lines of a block may be comments addressed to its host:
//
//     <!-- block:use chart.js@4, nouislider@15 -->     libraries to bring in: any package on npm
//     <!-- block:share notes tag=movie -->             anything else, for the app to read
//
// An app may have its own spelling (`potion:use`, `relay:use`): pass the names it answers to, and a block
// written for one app is read by another. Text in, text out: nothing here touches a page.

// One thing a block names: an npm package, the version wanted, a file in it when the package's own entry is
// not the one meant, and the global it should arrive as when the usual one will not do.
//
//     chart.js@4                                 the package
//     three@0.186/addons/controls/OrbitControls.js   a file of it
//     leaflet@1.9/dist/leaflet.css               a stylesheet of it
//     canvas-confetti@1 as confetti              under a name the block chooses
const SPEC = /^((?:@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*)(?:@([^/\s]+))?(\/\S+)?(?:\s+as\s+(\S+))?$/i;

/** @returns {{ name: string, version: string, path?: string, as?: string }} */
export function specOf(text) {
  const spec = SPEC.exec(String(text).trim());
  // What is not written as a package keeps its text as a name, so the loader can say that nothing is called that.
  if (!spec) return { name: String(text).trim().toLowerCase(), version: "latest" };
  return { name: spec[1].toLowerCase(), version: spec[2] ?? "latest", ...(spec[3] ? { path: spec[3] } : {}), ...(spec[4] ? { as: spec[4] } : {}) };
}

const escape = (name) => name.replace(/[^a-z0-9-]/gi, "");

/**
 * @param {string} html the block as its author wrote it
 * @param {{ names?: string[] }} [options] the directive names this app reads, besides `block`
 * @returns {{ source: string, libraries: { name: string, version: string, path?: string, as?: string }[], directives: { name: string, text: string }[], cover: string | null }}
 */
export function parse(html, { names = [] } = {}) {
  const ns = [...new Set(["block", ...names])].map(escape).filter(Boolean).join("|");
  const directive = new RegExp(`<!--\\s*(?:${ns}):([a-z][a-z0-9-]*)\\b([\\s\\S]*?)-->`, "gi");
  // A cover written inside the block: static markup shown where the block itself should not run (a feed card).
  const template = new RegExp(`<template\\s+data-(?:${ns})-(?:cover|feed)\\s*>([\\s\\S]*?)<\\/template>`, "i");

  let cover = null;
  const libraries = [];
  const directives = [];
  const source = String(html ?? "")
    .replace(template, (_all, markup) => {
      cover = markup.trim() || null;
      return "";
    })
    .replace(directive, (_all, name, text) => {
      if (name.toLowerCase() !== "use") {
        directives.push({ name: name.toLowerCase(), text: text.trim() });
        return "";
      }
      for (const spec of text.split(",").map((part) => part.trim()).filter(Boolean)) {
        const library = specOf(spec);
        if (!libraries.some((known) => known.name === library.name && known.version === library.version && known.path === library.path)) libraries.push(library);
      }
      return "";
    });
  return { source, libraries, directives, cover };
}
