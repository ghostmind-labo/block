// What a block may load, and what its frame may do. These two lines are the whole security model, so they
// live in one place: every app that shows a block gets the same sandbox, and a change here reaches them all.

/**
 * The frame's `sandbox` attribute: scripts, and nothing else. No `allow-same-origin`, so the document has an
 * opaque origin: no cookies, no storage, no way to read or steer the page around it.
 */
export const SANDBOX = "allow-scripts";

/**
 * The players a block may show (`<block-embed src="…">`): the iframe form of the embeds a note shows (YouTube,
 * Vimeo, Spotify, Reddit, Instagram). X is not one: its player (`platform.twitter.com/embed/Tweet.html`)
 * draws nothing on its own, even straight in a page (tried in Chrome). A closed list, the same in every app, that no block can add to. Each
 * is a path, so only the player of that site is allowed, not the rest of it.
 *
 * A player cannot run INSIDE the block's frame: a frame nested there inherits its sandbox, so it has no origin
 * of its own, and YouTube and Reddit refuse to play like that (tried in Chrome). So on a web page the block
 * only leaves a spot, and the page puts the player there, in a frame of its own laid over the block's (`mount`
 * does it). The address is turned into the player's by the page itself (`embedOf`), never taken from the
 * block, and the block reaches the player only by asking the page to seek, play or pause it.
 *
 * A block can still choose which video is shown, and so write what it knows into a player's address, which
 * only that site receives: the list holds the players of large sites, never a host anyone can publish a page on.
 */
export const EMBEDS = Object.freeze([
  "https://www.youtube-nocookie.com/embed/",
  "https://www.youtube.com/embed/",
  "https://player.vimeo.com/video/",
  "https://open.spotify.com/embed/",
  "https://embed.reddit.com/r/",
  "https://www.instagram.com/p/",
  "https://www.instagram.com/reel/",
]);

/**
 * The Content-Security-Policy written INTO the block's document: it may load itself and nothing more.
 * - `connect-src 'none'`: no fetch, XHR or WebSocket.
 * - pictures, fonts and media from `data:` (and `blob:` made inside the frame) only. An `https:` image would
 *   be a silent call out on open, with the viewer's address, that `connect-src` does not cover.
 * - `worker-src blob:` for libraries that build a worker from bytes they already hold (maps).
 * - no frame at all. A player (`<block-embed>`) is placed by the page over the spot the block leaves for it
 *   (see `EMBEDS`); only a block in a native app's web view, where the document is not sandboxed, frames the
 *   players itself (`WEBVIEW_POLICY`).
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

/** The policy of a block in a native app's web view: the same, and the players framed by the block itself. */
export const WEBVIEW_POLICY = `${POLICY}; frame-src ${EMBEDS.join(" ")}`;

/** A cover is a picture made of markup: it loads nothing and runs nothing (its frame's sandbox is empty). */
export const COVER_POLICY = ["default-src 'none'", "style-src 'unsafe-inline'", "img-src data:", "font-src data:"].join("; ");
export const COVER_SANDBOX = "";

/**
 * What the PAGE that shows blocks must add to its own policy (a response header, or a `<meta http-equiv>` in
 * its head). The two values above keep a block from loading anything, but a script may still set its own
 * frame's `location` to an outside address, with whatever it knows written in that address: a block that was
 * lent a person's notes could send them out that way. No policy inside the frame can forbid it; the page
 * around it can. A frame written with `srcdoc` loads nothing, so it is not refused by this.
 *
 * The players in `EMBEDS` are named: the page lays them over the block (`<block-embed>`). A frame written with
 * `srcdoc` takes this policy as well as its own, so a block could at most send its own frame to one of these
 * players. An app that shows other frames of its own adds them to this list. What matters is that the list
 * is closed.
 */
export const PAGE_POLICY = `frame-src ${EMBEDS.join(" ")}`;
