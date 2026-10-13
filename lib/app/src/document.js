// The document a block is shown in: the policy that lets it load nothing, the styles that keep it in its box,
// the host's object, the libraries it named, then the block. Text in, text out, so a web page, a server and a
// native app's web view all put a block in the very same document.

import { COVER_POLICY, POLICY } from "./policy.js";
import { bridgeScript } from "./host.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// A closing tag inside a library's text would end the element it is written in.
const inScript = (text) => String(text).replace(/<\/script/gi, "<\\/script");
const inStyle = (text) => String(text).replace(/<\/style/gi, "<\\/style");

// The frame around an inline block, which the block's own styles cannot beat (a layered !important wins over
// an unlayered one): nothing grows wider than its box.
const INLINE_FRAME = `@layer block-frame, block-defaults;
@layer block-frame {
  html, body { margin: 0 !important; }
  body { box-sizing: border-box !important; border: 0 solid transparent !important; position: relative !important; width: auto !important; max-width: 100% !important; min-width: 0 !important; overflow-x: auto !important; overflow-wrap: anywhere; }
  body > * { max-width: 100% !important; box-sizing: border-box !important; min-width: 0 !important; }
  img, video, canvas, svg, table, pre { max-width: 100% !important; }
  /* Expanded, the frame is as tall as the screen and not as its content: a block taller than the screen
     scrolls inside itself, or its bottom is out of reach. */
  html[data-block-expanded] { overflow-y: auto !important; }
}`;

// Runs in an inline block. The app may show a block bigger for a while (the whole screen): the block is told,
// as <html data-block-expanded> and under the app's own name too (data-potion-expanded), so its styles can
// fit the screen. Escape pressed inside the frame never reaches the page, so it is passed on.
const expandScript = (names) => `(function(){
  var names = ${JSON.stringify(names)};
  addEventListener('message', function(e){
    var d = e.data;
    if (e.source !== parent || !d || d.type !== 'block-expanded') return;
    names.forEach(function(name){ document.documentElement.toggleAttribute('data-' + name + '-expanded', !!d.on); });
  });
  addEventListener('keydown', function(e){
    if (e.key === 'Escape' && document.documentElement.hasAttribute('data-block-expanded')) parent.postMessage({ type: 'block-escape' }, '*');
  });
})();`;

// Runs in every block: what the page around it would do for an ordinary page, and a frame cannot.
//  - A link. The frame cannot take the reader anywhere, so a click on one is told to the app, which decides
//    (open a note, scroll its own page to a heading, nothing). A link to a place inside the block is the block's.
//  - The reader's text size, when the app has such a setting: the document is zoomed, like a browser's own zoom,
//    so type written in px follows too. The app sends it, so changing it never loads the block again.
//  - And a frame that starts says so, for an app that has something to tell it again (its size, that it is expanded).
const ROOM_SCRIPT = `(function(){
  addEventListener('click', function(e){
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (!href) return;
    // A place inside the block itself is the block's; "#heading" with no such place here is the app's page.
    if (href.charAt(0) === '#' && (href.length === 1 || document.getElementById(href.slice(1)))) return;
    e.preventDefault();
    parent.postMessage({ type: 'block-link', href: href.slice(0, 2000) }, '*');
  }, true);
  addEventListener('message', function(e){
    var d = e.data;
    if (e.source !== parent || !d || d.type !== 'block-scale') return;
    var z = Number(d.scale);
    if (!(z >= 0.5 && z <= 3)) return;
    document.documentElement.style.zoom = z === 1 ? '' : String(z);
    if (window.__blockTell) window.__blockTell();
  });
  parent.postMessage({ type: 'block-started' }, '*');
})();`;

// A block that fills its frame is the window: it is as tall as the frame and scrolls inside itself, so `vh`
// means what it says. Nothing has to be kept in.
const FILL_FRAME = `@layer block-frame, block-defaults;
@layer block-frame {
  html, body { margin: 0 !important; height: 100%; }
  body { box-sizing: border-box !important; }
}`;

// Runs in an inline block: tells the app how tall the content is (and how wide, for a slot that takes the
// width of what was drawn), whenever that changes, so the frame can be made that size and the block never
// scrolls inside the page.
const HEIGHT_SCRIPT = `(function(){
  var sent = '';
  function tell(){
    if (!document.body) return;
    var h = Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.offsetHeight));
    var w = Math.ceil(document.body.getBoundingClientRect().width);
    // A reader's text size zooms the document. The height above is in the document's own pixels and the frame
    // is sized in the page's, so it is converted by the ratio the browser itself reports.
    if (document.body.offsetHeight) {
      var k = document.body.getBoundingClientRect().height / document.body.offsetHeight;
      if (k > 0 && isFinite(k)) h = Math.ceil(h * k);
    }
    // A page that is not being looked at lays its frames out at no size at all: that is not the block's height.
    if (!h) return;
    if (h + 'x' + w !== sent) { sent = h + 'x' + w; parent.postMessage({ type: 'block-height', height: h, width: w }, '*'); }
  }
  window.__blockTell = tell;
  addEventListener('load', tell);
  // The body is what is watched, with the document around it. The document's own box is the frame's, which
  // the app sizes from what is told here: watched alone, a frame that was told small keeps a small box, the
  // box never changes again, and the block stays collapsed. The body grows with its content.
  function watch(){
    tell();
    if (!window.ResizeObserver) return setInterval(tell, 500);
    var seen = new ResizeObserver(tell);
    seen.observe(document.documentElement);
    if (document.body) seen.observe(document.body);
  }
  if (document.body) watch(); else addEventListener('DOMContentLoaded', watch);
  // And a few more times, spaced out: content that lays out late (a font, a library that draws after a
  // beat) and a page that was not showing when the block loaded. Telling the same size twice costs nothing.
  [60, 200, 600, 1500, 4000].forEach(function(ms){ setTimeout(tell, ms); });
})();`;

// A library's stylesheet usually paints its buttons and fields on a light ground it hard-coded, while a form
// control takes its ink from the document's colour scheme: on a dark ground that is white on white. So where a
// library brought styles, the controls (and only they) are kept to the light scheme.
const CONTROLS = "<style>button, input, select, textarea { color-scheme: light; }</style>";

// Runs first in every block: what goes wrong in it is told to the app, which is the only one that can show
// it (a block that throws is otherwise an empty box). A few messages at most.
const ERROR_SCRIPT = `(function(){
  var left = 5;
  function tell(message){ if (left-- > 0) parent.postMessage({ type: 'block-error', message: String(message).slice(0, 500) }, '*'); }
  addEventListener('error', function(e){ tell(e.message + (e.lineno ? ' (line ' + e.lineno + ')' : '')); });
  addEventListener('unhandledrejection', function(e){ tell(e.reason && e.reason.message ? e.reason.message : e.reason); });
})();`;

/**
 * @typedef {{ name: string, version?: string, source?: string, styles?: string }} LoadedLibrary
 *
 * @param {string} source the block, directives already taken out (see `parse`)
 * @param {object} [options]
 * @param {ReturnType<import("./host.js").defineHost>} [options.host] what the app lends the block
 * @param {LoadedLibrary[]} [options.libraries] the text of each library it named
 * @param {"inline" | "fill"} [options.mode] inline: as tall as its content, reported to the app. fill: as tall as the frame
 * @param {ReturnType<import("./slot.js").defineSlot>} [options.slot] where the block is shown. It decides the mode, and its name is written on `<html data-block-slot>` so one block can be drawn differently in two places
 * @param {"light" | "dark" | "light dark"} [options.scheme]
 * @param {string} [options.style] the app's own first styles (its type, its colours as variables). The block's styles win over them
 * @returns {string} a whole html document, for an iframe's `srcdoc` or a web view's `html`
 */
export function documentOf(source, { host, libraries = [], slot, mode = slot?.fill ? "fill" : "inline", scheme = "light dark", style = "" } = {}) {
  // A slot that takes the width of what was drawn: the body is as wide as its content, never wider than the frame.
  // Its limit is the slot's and not the frame's, which is only as wide as what was drawn a moment ago.
  const shrink = slot?.shrink && mode === "inline" ? `\n@layer block-frame { body { width: max-content !important; max-width: ${slot.width?.max ? `${slot.width.max}px` : "none"} !important; } }` : "";
  // A block that is only looked at does not scroll: what is past its slot is cut off.
  const still = slot && !slot.interactive ? "\n@layer block-frame { html, body { overflow: hidden !important; } }" : "";
  const sheets = libraries.filter((library) => library.styles).map((library) => `<style>${inStyle(library.styles)}</style>`).join("");
  const scripts = libraries.filter((library) => library.source).map((library) => `<script>${inScript(library.source)}</script>`).join("");
  // The policy comes first, where it must be to apply; libraries are classic scripts in the head, so each
  // one's global exists before the block's own script runs.
  return `<!doctype html><html${slot ? ` data-block-slot="${esc(slot.name)}"` : ""}><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${POLICY}">
<meta name="color-scheme" content="${esc(scheme)}">
<style>${mode === "fill" ? FILL_FRAME : INLINE_FRAME}${shrink}${still}
@layer block-defaults {
${inStyle(style)}
}</style>
${sheets}${sheets ? CONTROLS : ""}
<script>${ERROR_SCRIPT}</script>
${host ? `<script>${inScript(bridgeScript(host))}</script>` : ""}
${mode === "inline" ? `<script>${HEIGHT_SCRIPT}</script><script>${expandScript([...new Set(["block", ...(host ? [host.name.toLowerCase()] : [])])])}</script>` : ""}
<script>${ROOM_SCRIPT}</script>
${scripts}
</head><body>${source}</body></html>`;
}

/**
 * The document of a cover: static markup, no script. Its frame's sandbox is empty (`COVER_SANDBOX`).
 * @param {string} markup
 * @param {{ scheme?: string, style?: string }} [options]
 */
export function coverOf(markup, { scheme = "light dark", style = "" } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${COVER_POLICY}">
<meta name="color-scheme" content="${esc(scheme)}">
<style>${INLINE_FRAME}
@layer block-defaults {
${inStyle(style)}
}
html, body { height: 100% !important; overflow: hidden !important; }</style>
</head><body>${markup}</body></html>`;
}

/** What is shown in a block's place when a library it named could not be brought. */
export const problem = (lines) =>
  `<div style="font:13px ui-sans-serif,system-ui,sans-serif;padding:12px 14px;border:1px solid #9f2f2d;border-radius:4px;color:#9f2f2d"><strong>This block could not load what it asked for</strong><ul style="margin:6px 0 0;padding-left:18px">${lines.map((line) => `<li>${esc(line)}</li>`).join("")}</ul></div>`;
