# block

`@ghostmind-dev/block`: the sandboxed html block shared by the Ghostmind apps. Read `README.md` first for what it is and how it is used.

**The package is the product** (owner, 2026-10-19): `@ghostmind-dev/block` is what the apps use; this web app is the bench where it is tried. In dev the app runs `lib/` as it is on disk (below), so a change to the package is seen live before it is published. The app keeps blocks only, no layouts: a gallery of blocks, and a chat (`/make`) that makes or changes one block, drawn again at each write. Monochrome and minimal: the only colour on a page is a block's own.

**block is the reference** (owner, 2026-10-18) for every new app that needs custom html blocks: the package for the frame and the shared parts (rules, draft tools, the chat loop), this app for the live draft and the chat. How an app plugs in its own data and its own layouts (`<app>.self()` answered by the app) is that app's: the example is Potion, where the html block started.

## Map

- `lib/app/src/policy.js`: the frame's `sandbox` value and the Content-Security-Policy written into every block. The whole security model is these few lines
- `lib/app/src/parse.js`: the comment directives on a block's first lines (`<!-- block:use … -->`, an app's own spelling too) and the cover template
- `lib/app/src/host.js`: what an app lends its blocks. `defineHost` declares it (calls, watches, events), `bridgeScript` is the script that makes `window.<name>` in the frame, `serve` is the app's side. It knows no app's functions: an app's functions stay in the app
- `lib/app/src/document.js`: the whole document of a block or of a cover, as text
- `lib/app/src/libraries.js` and `catalogue.js`: how a library's text is fetched (any npm package; a module is rewritten as a classic script that makes a global) and what was learned about the ones that were tried
- `lib/app/src/rules.js`, `check.js`, `draft.js`, `turn.js`: writing a block with a model, for every app: the shared rules and `instructions()`, `sourceProblems()`, the draft tools and `publishing()`, and `runTurn()`, the chat loop without the model call (README, "Writing a block with a model")
- `lib/app/src/slot.js`: a place of an app and the room a block has there. `defineSlot`, `slotText` for the model, `fit` for the frame
- `lib/app/src/mount.js`: a block on a web page. The only file that touches a page
- `lib/app/src/webview.js`: a block in a native app's web view. The same document and the same `serve`, joined through a channel of text (`transport: "webview"`, `webviewTarget`, `fromWebview`)
- `demo/app`: a page with no build and no dependency; it imports the package's source from `/block/`
- `mcp/app/src/blocks`: this app's slots (`slots.ts`), the contract given to the model (`contract.ts`, from the package's `instructions`), the check that brings a block's libraries before it is saved (`check.ts`).
- `mcp/app/src/drafts` and `ai`: the live draft (`drafts` table, one per person, always a block) and the chat on the person's own OpenRouter account (`ai_connection`, the key encrypted with `AI_KEY_ENCRYPTION_KEY`). `ui/app/src/make.tsx` is the page (`/make`). `mcp/app/src/auth` and `db/hasura.ts` are format's, unchanged
- `ui/app/src/frame.tsx`: the one place the web app calls `mount`. `stage.tsx` draws the place around each slot
- `tunnel`: cloudflared, the one public host in dev (`block.ghostmind.app`) and in prod (`block.ghostmind.dev`). It sends `/mcp`, `/oauth`, `/.well-known` and `/api` to the mcp and the rest to the web app
- `.mcp.json`: the dev MCP (`block-dev`, block.ghostmind.app) for a Claude session in this repo. `plugin/.mcp.json` is the prod one
- In prod, `mcp` and `ui` read the package from npm, at an exact version (`@ghostmind-dev/block` in their `package.json`), like any other app: a change in `lib/` reaches prod only once it is published and that version is raised. In dev (any image built without `APP_ENV=prod`) their Dockerfiles replace the npm copy with a link to `lib/app`, and skaffold syncs `lib/app/src`, so dev (block.ghostmind.app) runs `lib/` as it is on disk, like `demo`

## Rules of this project

- **The sandbox does not loosen.** `sandbox="allow-scripts"` with no `allow-same-origin`, and a policy with `connect-src 'none'` and pictures from `data:` only. A picture written by address (`<img src="https://…">`) still shows: the page fetches it before the frame is made and writes it in as `data:` (`pictures.js`, `makePictures`), the way a library is brought; an address a script makes at run time is refused. A change that lets a block reach the network, the page or storage is the change to refuse. An app that needs something from outside lends it through its host.
- **The page that shows blocks closes its own `frame-src`** (`PAGE_POLICY` in `policy.js`; `ui/app/index.html` here). The frame's policy cannot stop a script from sending its own frame to an outside address with data in it; only the page around it can. Seen in a browser on 2026-10-13: without it the frame left, with it the browser refused. Potion, Relay and Tags do not have it yet.
- **No function of the app crosses into the frame.** The two sides exchange plain messages. A call that the host did not declare does not exist in the block, and `serve` refuses one that arrives anyway. An app may give a script of its own for the frame (`client` in `defineHost`: Potion's map protocol on maplibre). It is text, it runs inside the sandbox like the block, and it reaches the app only through the declared calls, so it lends the frame nothing.
- **No dependency, no build.** The package is plain ESM JavaScript that a browser, Node and a bundler read as it is. That is why the catalogue is a `.js` module and not a `.json` file.
- **No cache of our own.** Library files come from a public CDN and are kept by it and by the browser. The loader only joins two requests for the same file that are in flight together. An app that wants the fetch to go through its own server passes its own `fetch`.
- **The catalogue is not a gate.** Any npm package may be named; what keeps a block in is the frame. Do not add a check that refuses a name because it is not in the catalogue.
- **A library reaches the block as a global, never by `import`.** A frame cannot import from an address, and letting it (a `blob:` or `data:` source for scripts) is a change to the policy: `classicOf` in `libraries.js` is the way.
- **A size is said once.** A slot's numbers live in its definition; the page and the tool descriptions both read them from there.
- **Every app shows its blocks through this package** (Potion, tags.city, Relay: web and iOS, since 2026-10-13; `README.md`, State, says where each app's side is). A change to the document or the bridge reaches all of them when they raise the version, so it is tried in `demo` and on this app first. Those repos are worked in by other sessions: message the session, use a separate worktree, commit explicit paths.
- The catalogue began as Potion's and was copied by hand to Relay. Both still bring libraries from their own copy (their vendor routes), so a change to a library's entry has to be made in all three until they read this one.
- **No file names a cluster, and only the current contexts are used.** `skaffold dev` deploys to the current kube context and builds on the current Docker context; which cluster that is belongs to the owner, and a session never switches it. It must run the shared Postgres and the users service: `k8s/dev-setup.sh` asks the cluster and refuses one without them. When the current pair is not such a cluster, say so and stop.

## Traps met here

- **An effect written as an expression returns what the expression returns.** `useEffect(() => el.scrollIntoView(...))` hands React a promise in current Chrome (scroll methods return one), and React fails with "destroy is not a function": the page goes blank. Write effects with braces.
- **The dev tunnel caches the package in the browser.** Cloudflare adds `cache-control: max-age=14400` to what block.ghostmind.app serves, so after a change to `lib/` the page kept the old package (`does not provide an export named …`, a blank page) for hours. The dev server sends `/@fs/…/lib/app/src` files with `no-store` (`ui/app/vite.config.ts`).
- **Deleting a file makes skaffold rebuild, and the new pod can miss the edits made during the build.** It crashes on an import of the old files (`Cannot find module …`), never becomes ready, and skaffold waits for it without syncing: a deadlock. Copy the current files into the new pod (`kubectl cp`, dev only) or restart the routine in its pane.
- **A slot made in a render** (`roomSlot(room)` inline) remounts the frame on every render, and the loop closed Chrome twice. One slot per room: `ui/app/src/room.ts`.

## Check

`run routine test` in `lib/` and in `mcp/` must pass. The tests join the frame's script and the app's side without a browser (`node:vm`), so a change to the messages is caught there. A change to `mount.js` or to the document is checked in a browser before it is published, on the demo page (http://localhost:5105) or on dev (https://block.ghostmind.app, through the dev MCP), which both run `lib/` as it is on disk. After publishing and raising the version in `ui` and `mcp`, it is checked again on the web app's try page (https://block.ghostmind.app/try, or http://localhost:5106/try): its examples cover three.js, a chart and every slot. Look at the page itself: a frame in a tab that is not showing has no size and reports none.
