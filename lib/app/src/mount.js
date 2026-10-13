// A block on a web page: the sandboxed frame, the libraries it named, and the app's functions behind it.
// This is the only file that touches a page; a native app does the same with its web view and `serve`.

import { parse } from "./parse.js";
import { documentOf, problem } from "./document.js";
import { serve } from "./host.js";
import { SANDBOX } from "./policy.js";
import { fit } from "./slot.js";

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
 * @param {string[]} [options.names] the directive names this app reads, besides `block`
 * @param {ReturnType<import("./slot.js").defineSlot>} [options.slot] where the block is shown: the frame is kept to its width and height
 * @param {"inline" | "fill"} [options.mode] inline (default): the frame takes the height of its content. fill: it takes the container's. A slot decides it
 * @param {string} [options.scheme] `light`, `dark` or `light dark`
 * @param {string} [options.style] the app's first styles for every block
 * @param {string} [options.title] what a screen reader calls the frame
 * @param {(href: string) => void} [options.onLink] a link was clicked in the block; the app decides what it opens
 * @param {number} [options.scale] the reader's text size, 0.5 to 3 (1: as written). `scale(n)` changes it later
 * @param {() => void} [options.onEscape] Escape was pressed inside a block that is expanded
 * @param {() => void} [options.onReady] the block has drawn itself
 * @param {(message: string) => void} [options.onError] something threw in the block
 * @param {(size: { height: number | null, width: number | null }) => void} [options.onSize] the size the frame was just given
 * @returns {Promise<{ frame: HTMLIFrameElement, directives: { name: string, text: string }[], emit: (event: string, value: unknown) => void, expand: (on: boolean) => void, scale: (n: number) => void, destroy: () => void }>}
 *   `expand(true)`: the block is shown bigger for a while. The frame stops following its content's height and
 *   takes its container's, which the app makes as big as it likes (the screen); the block scrolls inside
 *   itself and is told (`<html data-block-expanded>`). The frame is never moved, so the block keeps its state.
 */
export async function mount(container, html, { host, handlers = {}, loader, names, slot, mode = slot?.fill ? "fill" : "inline", scheme, style, title = "", timeout, rate, scale = 1, onLink, onEscape, onReady, onError, onSize } = {}) {
  const parsed = parse(html, { names: names ?? (host ? [host.name] : []) });

  let libraries = [];
  let source = parsed.source;
  if (parsed.libraries.length) {
    const loaded = loader ? await loader.loadAll(parsed.libraries) : { libraries: [], problems: parsed.libraries.map((library) => `${library.name}: this page brings no libraries`) };
    if (loaded.problems.length) source = problem(loaded.problems);
    else libraries = loaded.libraries;
  }

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

  // The frame's origin is opaque, so a message is trusted by where it came from: this frame's own window.
  const onMessage = (event) => {
    if (event.source !== frame.contentWindow) return;
    // A frame that has just started (or started again) does not know it is expanded.
    if (event.data?.type === "block-started") {
      if (expanded) target.post({ type: "block-expanded", on: true });
      if (zoom !== 1) target.post({ type: "block-scale", scale: zoom });
    }
    if (event.data?.type === "block-escape" && expanded) onEscape?.();
    served.receive(event.data);
  };
  window.addEventListener("message", onMessage);

  frame.srcdoc = documentOf(source, { host, libraries, slot, mode, scheme, style });
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
      frame.remove();
    },
  };
}
