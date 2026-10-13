# block

`@ghostmind-dev/block`: the sandboxed html block shared by the Ghostmind apps. Read `README.md` first for what it is and how it is used.

## Map

- `lib/app/src/policy.js`: the frame's `sandbox` value and the Content-Security-Policy written into every block. The whole security model is these few lines
- `lib/app/src/parse.js`: the comment directives on a block's first lines (`<!-- block:use … -->`, an app's own spelling too) and the cover template
- `lib/app/src/host.js`: what an app lends its blocks. `defineHost` declares it, `bridgeScript` is the script that makes `window.<name>` in the frame, `serve` is the app's side
- `lib/app/src/document.js`: the whole document of a block or of a cover, as text
- `lib/app/src/libraries.js` and `catalogue.js`: how a library's text is fetched (any npm package; a module is rewritten as a classic script that makes a global) and what was learned about the ones that were tried
- `lib/app/src/slot.js`: a place of an app and the room a block has there. `defineSlot`, `slotText` for the model, `fit` for the frame
- `lib/app/src/mount.js`: a block on a web page. The only file that touches a page
- `demo/app`: a page with no build and no dependency; it imports the package's source from `/block/`
- `mcp/app/src/blocks`: this app's slots (`slots.ts`), the contract given to the model (`contract.ts`), the check that brings a block's libraries before it is saved (`check.ts`). `mcp/app/src/auth` and `db/hasura.ts` are format's, unchanged
- `ui/app/src/frame.tsx`: the one place the web app calls `mount`. `stage.tsx` draws the place around each slot
- `tunnel`: cloudflared, the one public host in dev (`block.ghostmind.app`) and in prod (`block.ghostmind.dev`). It sends `/mcp`, `/oauth`, `/.well-known` and `/api` to the mcp and the rest to the web app
- `.mcp.json`: the dev MCP (`block-dev`, block.ghostmind.app) for a Claude session in this repo. `plugin/.mcp.json` is the prod one
- `mcp` and `ui` read the package as a `file:` dependency and build from the repo root (their Dockerfiles copy `lib/app`)

## Rules of this project

- **The sandbox does not loosen.** `sandbox="allow-scripts"` with no `allow-same-origin`, and a policy with `connect-src 'none'` and pictures from `data:` only. A change that lets a block reach the network, the page or storage is the change to refuse. An app that needs something from outside lends it through its host.
- **Nothing of the app is injected into the frame.** The two sides exchange plain messages. A call that the host did not declare does not exist in the block, and `serve` refuses one that arrives anyway.
- **No dependency, no build.** The package is plain ESM JavaScript that a browser, Node and a bundler read as it is. That is why the catalogue is a `.js` module and not a `.json` file.
- **No cache of our own.** Library files come from a public CDN and are kept by it and by the browser. The loader only joins two requests for the same file that are in flight together. An app that wants the fetch to go through its own server passes its own `fetch`.
- **The catalogue is not a gate.** Any npm package may be named; what keeps a block in is the frame. Do not add a check that refuses a name because it is not in the catalogue.
- **A library reaches the block as a global, never by `import`.** A frame cannot import from an address, and letting it (a `blob:` or `data:` source for scripts) is a change to the policy: `classicOf` in `libraries.js` is the way.
- **A size is said once.** A slot's numbers live in its definition; the page and the tool descriptions both read them from there.
- **The apps keep their own block until they are moved, one at a time.** Potion (`ui/app/src/components/HtmlBlockRenderer.tsx`), Relay (`api/app/src/ui/frame.js`) and Tags (`shared/pure/layout-frame.ts`) are where this code came from. Do not remove anything there from this project.
- The catalogue began as Potion's and was copied by hand to Relay. Until both read this one, a change to a library's entry has to be made in all three.
- **No file names a cluster.** `skaffold dev` deploys to the current kube context. The shared Postgres and the users service resolve only inside the M1's cluster, so switch to that pair before a dev routine: `kubectl config use-context m1 && docker context use m1`. `k8s/dev-setup.sh` refuses a cluster without the shared Postgres, by asking the cluster and not by its name.

## Check

`run routine test` in `lib/` and in `mcp/` must pass. The tests join the frame's script and the app's side without a browser (`node:vm`), so a change to the messages is caught there. A change to `mount.js` or to the document is checked in a browser, on the web app's try page (https://block.ghostmind.app/try, or http://localhost:5106/try): its examples cover three.js, a chart and every slot. Look at the page itself: a frame in a tab that is not showing has no size and reports none.
