// @ghostmind-dev/block: the sandboxed html block.
// Everything here is text in, text out, and runs the same in a browser, in Node and in a native app.
// The one part that touches a page is `mount`, in "@ghostmind-dev/block/web".

export { SANDBOX, POLICY, COVER_SANDBOX, COVER_POLICY } from "./policy.js";
export { parse, specOf } from "./parse.js";
export { defineHost, bridgeScript, serve } from "./host.js";
export { documentOf, coverOf, problem, esc } from "./document.js";
export { defineSlot, slotText, fit } from "./slot.js";
export { makeLoader, describe, classicOf, globalOf, validVersion, pin, LibraryError } from "./libraries.js";
