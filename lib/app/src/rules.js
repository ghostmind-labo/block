// What whoever writes a block is told: the rules every app's blocks share, and one builder that puts them
// together with what is the app's own (the functions it lends, its places, the data a block is drawn with).
// Said once here, so an app does not keep a copy of the rules that drifts from the frame.

import { slotText } from "./slot.js";

/** The rules every block keeps, whatever the app. Numbered from 1 in `instructions`. */
export const RULES = Object.freeze([
  "A block is one text of html: markup, a <style> and a <script>, as a fragment or a whole document. No ``` fence.",
  "It runs in a frame that reaches nothing: no network (no fetch, no <script src>, no <link>, no font, frame or css url() by address), no storage (no localStorage, no cookies), no access to the page around it, no eval and no new Function. A picture by address is written as it is, <img src=\"https://…\">: the app brings it into the block before it is shown. An address a script makes at run time (new Image, a css url()) is refused.",
  "A library is asked for on the first lines, never loaded by the block itself: <!-- block:use chart.js@4 -->. Any package on npm may be named, several separated by commas, a major version pinned. It arrives as a GLOBAL, never by import: `Chart`, `THREE`, `d3`. A file of a package joins its global when both are named: `three@0.186, three@0.186/addons/controls/OrbitControls.js` gives `THREE.OrbitControls`.",
  "The ground is the app's, light or dark, and it is not yours to assume. Either inherit it (transparent ground, `color: inherit`, `currentColor`, translucent greys such as rgba(127,127,127,.25)) or own it (paint a ground of your own and every colour on it). `prefers-color-scheme` works; never assume white.",
  "Never leave an empty box: draw something before any animation starts, and write the fallback for what may be missing. Nothing the app gives is required: a value that is not there (a field the app does not have, a null, an empty list) is simply not drawn, never an error and never a placeholder like \"undefined\".",
  "The room is a range, not a number, and it changes: a panel is dragged wider, a phone is turned, and the frame gets its real size a moment AFTER the block starts. Lay out with what flows (%, flex, grid, `clamp()`, `min()`), never with one fixed width. Whatever a script measures (a canvas, a chart, a 3D renderer) is sized from its parent, with a `ResizeObserver` on that parent: not once at the start, and not from `window`.",
  "Where the frame is as tall as its content, `100vh`, `height: 100%` and `position: fixed; inset: 0` take the frame's height, which is the block's own: the block has none, and the frame stays a sliver. A canvas or a 3D scene sits in a parent with a height of its own (`aspect-ratio: 16 / 9`, or pixels), its overlays positioned `absolute` inside it. Write it like a page only where the place fills the frame (`html[data-block-slot=\"page\"]`).",
  "Text that came from a person or from data goes in with `textContent`, never `innerHTML`.",
]);

/**
 * The text that tells a model (or a skill) how to write a block for this app.
 * @param {object} [options]
 * @param {ReturnType<import("./slot.js").defineSlot>[]} [options.slots] the app's places. One slot: the block is written for it
 * @param {ReturnType<import("./host.js").defineHost>} [options.host] what the app lends its blocks
 * @param {Record<string, string>} [options.calls] what each of the host's calls and watches does, in a sentence, with its arguments
 * @param {unknown} [options.sample] the data a block is drawn with, as the app's call returns it
 * @param {string} [options.extra] the app's own rules, added after the shared ones
 */
export function instructions({ slots = [], host, calls = {}, sample, extra = "" } = {}) {
  const parts = [`WRITING A BLOCK\n${RULES.map((rule, i) => `${i + 1}. ${rule}`).join("\n")}`];
  if (slots.length === 1) parts.push(`WHERE IT IS SHOWN\n${slotText(slots[0])}`);
  else if (slots.length) parts.push(`WHERE IT IS SHOWN: it is written for ONE of these places, which decides its room. The place's name is on <html data-block-slot="…">.\n${slots.map((slot) => `- ${slotText(slot)}`).join("\n")}`);
  if (host) {
    const names = [...host.calls, ...host.watches];
    const lines = names.map((name) => `- ${host.name}.${name}(…)${host.watches.includes(name) ? " (a watch: it answers again each time the value changes, until the block stops it)" : ""}: ${calls[name] ?? "lent by the app"}`);
    if (host.events.length) lines.push(`- ${host.name}.on(name, listener) for the events ${host.events.join(", ")}`);
    parts.push(`WHAT THE APP LENDS: \`window.${host.name}\`, nothing else. Every call returns a promise; one the app did not lend does not exist.\n${lines.join("\n") || "(no calls)"}`);
  }
  if (sample !== undefined) parts.push(`THE DATA IT IS DRAWN WITH (a sample, shaped as the app gives it):\n${JSON.stringify(sample, null, 2).slice(0, 6000)}`);
  if (extra.trim()) parts.push(extra.trim());
  return parts.join("\n\n");
}
