// What can be seen wrong in a block before it is drawn or kept: read from its text, so a model is told at
// once and in words, and not by an empty frame. The frame stays what keeps a block in; this only says early
// what the frame would refuse, and the mistakes that leave a block a sliver. Nothing here fetches.

import { parse } from "./parse.js";
import { validVersion } from "./libraries.js";

/** The most a block's source may be, in bytes. */
export const SOURCE_MAX_BYTES = 200_000;

const bytesOf = (text) => new TextEncoder().encode(text).length;

// The rules of every <style> in the source, as { selector, body }. Enough of css to tell where a rule applies.
function cssRules(source) {
  const rules = [];
  for (const [, css] of source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const flat = css.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, selector, body] of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) rules.push({ selector: selector.trim(), body });
  }
  return rules;
}

// A rule written for the places where the frame is the window: there, vh and 100% mean what they say.
const forTheWindow = (selector) => /data-block-slot\s*=\s*["']?page|data-block-expanded|data-[a-z]+-expanded/i.test(selector);

/**
 * Why a block will not work, in words a model can act on: what the frame refuses. Empty: nothing seen.
 * How it fits its room is advice, apart (`roomAdvice`): a block that does not size itself well is still drawn.
 * @param {string} source the block as it was written
 * @param {object} [options]
 * @param {string[]} [options.names] the directive names the app reads, besides `block`
 * @returns {string[]}
 */
export function sourceProblems(source, { names = [] } = {}) {
  const text = String(source ?? "");
  if (!text.trim()) return ["the source is empty"];
  const problems = [];
  const bytes = bytesOf(text);
  if (bytes > SOURCE_MAX_BYTES) problems.push(`the source is ${bytes} bytes; a block is ${SOURCE_MAX_BYTES} at most`);
  if (/^\s*```/.test(text)) problems.push("the source starts with a ``` fence: give the html itself");

  // What the frame refuses.
  if (/\bfetch\s*\(|\bXMLHttpRequest\b|\bnew\s+WebSocket\b|\bnew\s+EventSource\b|\bsendBeacon\s*\(/.test(text)) problems.push("it reaches for the network (fetch, XMLHttpRequest, WebSocket…): a block reaches nothing, and what it needs from outside the app lends it");
  if (/<script\b[^>]*\bsrc\s*=/i.test(text)) problems.push("it loads a script by address: name the library on the first line instead, <!-- block:use name@version -->");
  if (/<link\b[^>]*\bhref\s*=/i.test(text)) problems.push("it loads a stylesheet by address: name it as a file of its package in <!-- block:use -->, e.g. leaflet@1.9/dist/leaflet.css");
  if (/<(?:img|iframe|video|audio|source|embed|object)\b[^>]*\b(?:src|data)\s*=\s*["']?(?:https?:)?\/\//i.test(text) || /url\(\s*["']?(?:https?:)?\/\//i.test(text)) problems.push("it shows something from an address (an image, a font, a frame): only inline svg, a canvas or a data: address shows");
  if (/(?:^|[;>{}])\s*import\s[^;<]*?\bfrom\s*["']|(?:^|[;>{}])\s*import\s*["']|\bimport\s*\(\s*["']/m.test(text)) problems.push("it imports a module: a library arrives as a global (THREE, Chart, d3), named in <!-- block:use -->");
  if (/\b(?:localStorage|sessionStorage|indexedDB)\b|\bdocument\.cookie\b/.test(text)) problems.push("it uses storage (localStorage, cookies…): a block keeps nothing between two showings");
  if (/\beval\s*\(|\bnew\s+Function\s*\(/.test(text)) problems.push("it uses eval or new Function, which the frame refuses");

  // What it names.
  for (const library of parse(text, { names }).libraries) {
    if (library.version === "latest") problems.push(`${library.name} has no version: pin a major one (${library.name}@<major>), a block is kept for years`);
    else if (!validVersion(library.version)) problems.push(`${library.name}@${library.version} is not a version`);
  }

  return [...new Set(problems)];
}

/**
 * How a block could fit its room better, for the model that writes it (not a refusal: the frame gives a block with
 * no height of its own a shape of its own, and it is drawn). Only where the frame is as tall as what the block lays
 * out: a room of a fixed height, or one that fills its window, is the window, and vh, 100% and fixed mean it.
 * @param {string} source
 * @param {{ slot?: ReturnType<import("./slot.js").defineSlot> }} [options]
 * @returns {string[]}
 */
export function roomAdvice(source, { slot } = {}) {
  if (!slot || slot.fill) return [];
  if (slot.height?.min != null && slot.height.min === slot.height.max) return [];
  const advice = [];
  for (const { selector, body } of cssRules(String(source ?? ""))) {
    if (forTheWindow(selector)) continue;
    if (/\d\s*(?:d|s|l)?vh\b/.test(body)) advice.push(`"${selector}" uses vh: here the frame is as tall as the layout, so vh is its own height. Give it a height of its own (aspect-ratio or px)`);
    if (/position\s*:\s*fixed/i.test(body)) advice.push(`"${selector}" is position: fixed: here it takes no room, and the layout has no height of its own. Use a parent with a height of its own and position: absolute inside it`);
    if (/(?:^|,)\s*(?:html|body)\b/i.test(selector) && /(?:^|;)\s*(?:min-)?height\s*:\s*100%/i.test(body)) advice.push(`"${selector}" is height: 100%: here that is the frame's height, which is the layout's own. Leave html and body as tall as their content`);
  }
  return [...new Set(advice)];
}
