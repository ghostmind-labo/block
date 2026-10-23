# block

`@ghostmind-dev/block`: the sandboxed html block shared by the Ghostmind apps, open source (MIT) on npm. Read `README.md` first for what it is and how it is used.

**The package is the product** (owner, 2026-10-22): this repo is the library, its tests and a demo page to try it locally. There is no web app, no server and no cluster any more (the app, the MCP, the database and the tunnel were removed on 2026-10-22; they are in the git history). An app that tries the package is brought back as a simple app on top of it, only if it is needed.

## Map

- `lib/app/src/policy.js`: the frame's `sandbox` value and the Content-Security-Policy written into every block. The whole security model is these few lines
- `lib/app/src/parse.js`: the comment directives on a block's first lines (`<!-- block:use … -->`, an app's own spelling too) and the cover template
- `lib/app/src/host.js`: what an app lends its blocks. `defineHost` declares it (calls, watches, events), `bridgeScript` is the script that makes `window.<name>` in the frame, `serve` is the app's side. It knows no app's functions: an app's functions stay in the app
- `lib/app/src/document.js`: the whole document of a block or of a cover, as text, with the args a copy is drawn with (`<host>.args()`) and the height it reports
- `lib/app/src/libraries.js` and `catalogue.js`: how a library's text is fetched (any npm package; a module is rewritten as a classic script that makes a global) and what was learned about the ones that were tried
- `lib/app/src/rules.js`, `check.js`, `draft.js`, `turn.js`: writing a block with a model, for every app: the shared rules and `instructions()`, `sourceProblems()`, the draft tools and `publishing()`, and `runTurn()`, the chat loop without the model call
- `lib/app/src/slot.js`: a place of an app and the room a block has there. `defineSlot`, `slotText` for the model, `fit` for the frame
- `lib/app/src/pictures.js` and `relay.js`: the pictures a block shows by address, brought in as `data:` by the page, and relayed by an app's server for a host that refuses other sites
- `lib/app/src/mount.js`: a block on a web page. The only file that touches a page
- `lib/app/src/webview.js`: a block in a native app's web view. The same document and the same `serve`, joined through a channel of text
- `demo/app`: a page with no build and no dependency; it imports the package's source from `/block/`
- `plugin/skills/html-block`: the rules every block follows in every app. Updated with every change to the package

## Rules of this project

- **The sandbox does not loosen.** `sandbox="allow-scripts"` with no `allow-same-origin`, and a policy with `connect-src 'none'` and pictures from `data:` only. A picture written by address still shows: the page fetches it before the frame is made and writes it in as `data:` (`makePictures`), the way a library is brought; an address a script makes at run time is refused. A change that lets a block reach the network, the page or storage is the change to refuse. An app that needs something from outside lends it through its host.
- **The page that shows blocks closes its own `frame-src`** (`PAGE_POLICY` in `policy.js`). The frame's policy cannot stop a script from sending its own frame to an outside address with data in it; only the page around it can.
- **No function of the app crosses into the frame.** The two sides exchange plain messages. A call that the host did not declare does not exist in the block, and `serve` refuses one that arrives anyway. An app's own script for the frame (`client` in `defineHost`) is text that runs inside the sandbox and reaches the app only through the declared calls.
- **No dependency, no build.** The package is plain ESM JavaScript that a browser, Node and a bundler read as it is. That is why the catalogue is a `.js` module and not a `.json` file.
- **No cache of our own.** Library files come from a public CDN. The loader only joins two requests for the same file that are in flight together. An app that wants the fetch to go through its own server passes its own `fetch`.
- **The catalogue is not a gate.** Any npm package may be named; what keeps a block in is the frame.
- **A library reaches the block as a global, never by `import`.** Letting a frame import (a `blob:` or `data:` source for scripts) is a change to the policy: `classicOf` in `libraries.js` is the way.
- **A size is said once.** A slot's numbers live in its definition; the page and the tool descriptions both read them from there.
- **Every app shows its blocks through this package** (Potion, tags.city, Relay: web and iOS). A change to the document or the bridge reaches all of them when they raise the version, so it is tried on the demo page first. Those repos are worked in by other sessions: message the session, use a separate worktree, commit explicit paths.
- **The docs move with the code.** A change to the package updates `README.md`, `lib/app/README.md` when it is about use, the rules in `rules.js`, and `plugin/skills/html-block` (then the plugin's version).
- **The repo is public.** No secret, no private address and no person's data in a file or a commit.

## Check

`run routine test` in `lib/` (or `npm test` in `lib/app`) must pass. The tests join the frame's script and the app's side without a browser (`node:vm`), so a change to the messages is caught there. A change to `mount.js` or to the document is checked in a browser on the demo page (http://localhost:5105, `run routine dev` in `demo/`), which runs `lib/` as it is on disk. Look at the page itself: a frame in a tab that is not showing has no size and reports none.

## Publish

Raise `version` in `lib/app/package.json`, run the tests, `npm publish --access public` in `lib/app`, and tell the apps' sessions which version to raise to.
