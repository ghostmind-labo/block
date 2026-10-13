// What a block may load, and what its frame may do. These two lines are the whole security model, so they
// live in one place: every app that shows a block gets the same sandbox, and a change here reaches them all.

/**
 * The frame's `sandbox` attribute: scripts, and nothing else. No `allow-same-origin`, so the document has an
 * opaque origin: no cookies, no storage, no way to read or steer the page around it.
 */
export const SANDBOX = "allow-scripts";

/**
 * The Content-Security-Policy written INTO the block's document: it may load itself and nothing more.
 * - `connect-src 'none'`: no fetch, XHR or WebSocket.
 * - pictures, fonts and media from `data:` (and `blob:` made inside the frame) only. An `https:` image would
 *   be a silent call out on open, with the viewer's address, that `connect-src` does not cover.
 * - `worker-src blob:` for libraries that build a worker from bytes they already hold (maps).
 * - no form posts, no `<base>`.
 */
export const POLICY = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "worker-src blob:",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

/** A cover is a picture made of markup: it loads nothing and runs nothing (its frame's sandbox is empty). */
export const COVER_POLICY = ["default-src 'none'", "style-src 'unsafe-inline'", "img-src data:", "font-src data:"].join("; ");
export const COVER_SANDBOX = "";
