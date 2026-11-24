// A block on a web page: the sandboxed frame, the libraries it named, and the app's functions behind it.
// This is the only file that touches a page; a native app does the same with its web view and `serve`.

import { parse } from "./parse.js";
import { bringPictures } from "./pictures.js";
import { documentOf, problem } from "./document.js";
import { serve } from "./host.js";
import { SANDBOX } from "./policy.js";
import { fit } from "./slot.js";
import { embedOf, playerMessage } from "./embed.js";

const MIN_HEIGHT = 24;

/**
 * @param {HTMLElement} container the block's frame is added to it
 * @param {string} html the block as written, directives included
 * @param {object} [options]
 * @param {ReturnType<import("./host.js").defineHost>} [options.host] what the app lends the block
 * @param {Record<string, (...args: any[]) => any>} [options.handlers] one function per call and per watch the host declares
 * @param {number} [options.timeout] ms a call may take (default 30 s)
 * @param {{ calls: number, per: number }} [options.rate] at most `calls` in any `per` ms from this block (default: no limit)
 * @param {{ loadAll: Function }} [options.loader] from `makeLoader()`; without it a block that names a library is refused
 * @param {{ bring: (address: string) => Promise<string> }} [options.pictures] from `makePictures()`: brings each `<img src="https://…">` in as data:; without it those pictures are left out
 * @param {string[]} [options.names] the directive names this app reads, besides `block`
 * @param {ReturnType<import("./slot.js").defineSlot>} [options.slot] where the block is shown: the frame is kept to its width and height
 * @param {"inline" | "fill"} [options.mode] inline (default): the frame takes the height of its content. fill: it takes the container's. A slot decides it
 * @param {string} [options.scheme] `light`, `dark` or `light dark`
 * @param {string} [options.style] the app's first styles for every block
 * @param {Record<string, string | number | boolean>} [options.args] the values this copy of the block is drawn with: `<host>.args()` in the block
 * @param {string} [options.title] what a screen reader calls the frame
 * @param {(href: string) => void} [options.onLink] a link was clicked in the block; the app decides what it opens
 * @param {number} [options.scale] the reader's text size, 0.5 to 3 (1: as written). `scale(n)` changes it later
 * @param {() => void} [options.onEscape] Escape was pressed inside a block that is expanded
 * @param {() => void} [options.onReady] the block has drawn itself
 * @param {(message: string) => void} [options.onError] something threw in the block, or a library or a picture it named could not be brought
 * @param {(size: { height: number | null, width: number | null }) => void} [options.onSize] the size the frame was just given
 * @returns {Promise<{ frame: HTMLIFrameElement, directives: { name: string, text: string }[], emit: (event: string, value: unknown) => void, expand: (on: boolean) => void, scale: (n: number) => void, destroy: () => void }>}
 *   `expand(true)`: the block is shown bigger for a while. The frame stops following its content's height and
 *   takes its container's, which the app makes as big as it likes (the screen); the block scrolls inside
 *   itself and is told (`<html data-block-expanded>`). The frame is never moved, so the block keeps its state.
 */
export async function mount(container, html, { host, handlers = {}, loader, pictures, names, slot, mode = slot?.fill ? "fill" : "inline", scheme, style, args, title = "", timeout, rate, scale = 1, onLink, onEscape, onReady, onError, onSize } = {}) {
  const parsed = parse(html, { names: names ?? (host ? [host.name] : []) });

  let libraries = [];
  let source = parsed.source;
  if (parsed.libraries.length) {
    const loaded = loader ? await loader.loadAll(parsed.libraries) : { libraries: [], problems: parsed.libraries.map((library) => `${library.name}: this page brings no libraries`) };
    // The block is replaced by the problem, and the app is told, as it is told of anything else that went wrong.
    if (loaded.problems.length) {
      source = problem(loaded.problems);
      for (const message of loaded.problems) onError?.(message);
    }
    else libraries = loaded.libraries;
  }
  // The pictures it shows by address, brought in as data: (the frame itself loads none).
  const shown = await bringPictures(source, pictures);
  source = shown.source;
  for (const message of shown.problems) onError?.(message);

  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", SANDBOX);
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.title = title;
  const px = (n) => (n == null ? "" : `${n}px`);
  frame.style.cssText = `display:block;width:100%;border:0;${mode === "fill" ? "height:100%" : `height:${slot?.height?.min ?? MIN_HEIGHT}px`}`;
  if (slot?.width) Object.assign(frame.style, { maxWidth: px(slot.width.max), minWidth: px(slot.width.min) });
  // A frame that takes the width of what was drawn starts at the most it may be, and comes down from there.
  if (slot?.shrink && slot.width?.max) frame.style.width = px(slot.width.max);
  if (slot && !slot.interactive) {
    frame.style.pointerEvents = "none";
    frame.tabIndex = -1;
  }

  const target = { post: (message) => frame.contentWindow?.postMessage(message, "*") };
  let expanded = false;
  let zoom = Number(scale) || 1;
  let measured = null;
  const inSlot = { height: frame.style.height, width: frame.style.width, maxWidth: frame.style.maxWidth, minWidth: frame.style.minWidth };
  // The frame at the size its content and its slot give it.
  const place = () => {
    Object.assign(frame.style, inSlot);
    if (!measured) return;
    frame.style.height = `${measured.height}px`;
    if (measured.width != null) frame.style.width = `${measured.width}px`;
    onSize?.(measured);
  };
  const hooks = {
    ...(timeout === undefined ? {} : { timeout }),
    rate,
    onLink,
    onReady,
    onError,
    onHeight: (height, width) => {
      if (mode !== "inline") return;
      measured = fit(slot, { height, width });
      // Expanded, the frame is the container's size; what the content measures is kept for when it comes back.
      if (!expanded) place();
    },
  };
  // A block with no host still reports its height and its readiness.
  const served = serve(host ?? { name: "block", calls: [], watches: [], events: [] }, target, handlers, hooks);
  const players = playersOver(frame, container);

  // The frame's origin is opaque, so a message is trusted by where it came from: this frame's own window.
  const onMessage = (event) => {
    if (event.source !== frame.contentWindow) return;
    // A frame that has just started (or started again) does not know it is expanded.
    if (event.data?.type === "block-started") {
      if (expanded) target.post({ type: "block-expanded", on: true });
      if (zoom !== 1) target.post({ type: "block-scale", scale: zoom });
    }
    if (event.data?.type === "block-escape" && expanded) onEscape?.();
    if (event.data?.type === "block-started") players.clear();
    if (event.data?.type === "block-embed") players.receive(event.data);
    served.receive(event.data);
  };
  window.addEventListener("message", onMessage);

  frame.srcdoc = documentOf(source, { host, libraries, slot, mode, scheme, style, args });
  container.appendChild(frame);

  return {
    frame,
    directives: parsed.directives,
    libraries,
    emit: served.emit,
    expand(on) {
      if (mode !== "inline" || expanded === Boolean(on)) return;
      expanded = Boolean(on);
      if (expanded) Object.assign(frame.style, { height: "100%", width: "100%", maxWidth: "", minWidth: "" });
      else place();
      target.post({ type: "block-expanded", on: expanded });
    },
    /** The reader's text size changed. The block is zoomed where it is, not loaded again. */
    scale(next) {
      zoom = Number(next) || 1;
      target.post({ type: "block-scale", scale: zoom });
    },
    destroy() {
      window.removeEventListener("message", onMessage);
      served.stop();
      players.clear();
      frame.remove();
    },
  };
}

// The players a block shows (`<block-embed>`), laid over the spots it left for them. A player cannot run inside
// the block's frame (a frame nested there has no origin of its own, and YouTube refuses to play), so it is a
// frame of the page, in a layer over the block's frame that clips to it. The block says where a spot is and
// which address it holds; the address becomes the player's here (`embedOf`), so only a player of `EMBEDS` is
// ever made, and the block reaches it only through seek, play and pause.
// The layer is added next to the frame only when a block has a player, so nothing else changes on the page.
// The layer sits in the block's container, which is made its containing block (`position: relative`, only if it
// was static): it moves and scrolls with the frame, and whatever clips the frame clips the players too.
function playersOver(frame, container) {
  const shown = new Map();
  let layer = null;
  let watch = null;
  const follow = () => {
    if (!layer) return;
    const hidden = !frame.isConnected || frame.offsetParent !== container;
    Object.assign(layer.style, { display: hidden ? "none" : "block", left: `${frame.offsetLeft + frame.clientLeft}px`, top: `${frame.offsetTop + frame.clientTop}px`, width: `${frame.clientWidth}px`, height: `${frame.clientHeight}px` });
  };
  const open = () => {
    if (layer) return;
    if (getComputedStyle(container).position === "static") container.style.position = "relative";
    layer = document.createElement("div");
    layer.style.cssText = "position:absolute;overflow:hidden;pointer-events:none";
    frame.after(layer);
    if (window.ResizeObserver) {
      watch = new ResizeObserver(follow);
      watch.observe(frame);
      watch.observe(container);
    }
    window.addEventListener("resize", follow);
    follow();
  };
  const close = (id) => {
    shown.get(id)?.frame.remove();
    shown.delete(id);
  };
  return {
    receive(data) {
      const id = String(data.id ?? "").slice(0, 40);
      if (!id) return;
      if (data.gone) return close(id);
      if (data.act) {
        const one = shown.get(id);
        const message = one && playerMessage(one.site, data.act, Number(data.value) || 0);
        if (message) one.frame.contentWindow?.postMessage(message[0], message[1]);
        return;
      }
      const player = embedOf(data.src);
      if (!player) return close(id);
      open();
      let one = shown.get(id);
      if (!one || one.src !== player.src) {
        close(id);
        const made = document.createElement("iframe");
        made.src = player.src;
        made.title = String(data.title || player.site).slice(0, 200);
        made.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write");
        made.setAttribute("allowfullscreen", "");
        made.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
        // Its own origin (the site's), and nothing over the page: it cannot take the page anywhere.
        made.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox");
        made.style.cssText = "position:absolute;border:0;pointer-events:auto;background:#000";
        layer.appendChild(made);
        one = { site: player.site, src: player.src, frame: made };
        shown.set(id, one);
      }
      const n = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
      Object.assign(one.frame.style, { left: `${n(data.x)}px`, top: `${n(data.y)}px`, width: `${Math.max(0, n(data.width))}px`, height: `${Math.max(0, n(data.height))}px`, display: n(data.width) && n(data.height) ? "block" : "none" });
      follow();
    },
    clear() {
      for (const id of [...shown.keys()]) close(id);
      watch?.disconnect();
      window.removeEventListener("resize", follow);
      layer?.remove();
      layer = null;
    },
  };
}
