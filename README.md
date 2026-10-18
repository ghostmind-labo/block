# block

The sandboxed html block that Potion, Relay and Tags each built for themselves, as one package: the document a block runs in, the libraries it may name, and the functions its host app lends it.

A block is html written by a person or a model. It is shown in a frame that reaches nothing: no network, no storage, not the page around it. Whatever it needs from outside, the app lends it by name.

| Folder | What it is |
|---|---|
| `lib/` | `@ghostmind-dev/block`, the npm package. Plain ESM JavaScript, no dependency |
| `ui/` | The web app: a person's blocks, each shown in the slot it was written for, and a page to try one without keeping it (https://block.ghostmind.app in dev) |
| `mcp/` | The remote MCP (Google sign-in) that makes and changes blocks, and the API the web app reads |
| `db/` | Hasura on the shared Postgres: one row per block |
| `tunnel/` | cloudflared: `block.ghostmind.app` (dev) and `block.ghostmind.dev` (prod), by path to the mcp and the web app |
| `plugin/` | The Claude plugin: the prod MCP and the skill that teaches writing a block |
| `demo/` | A page with no build that mounts one block and lends it its scroll (http://localhost:5105) |

## Use

```js
import { defineHost, makeLoader } from "@ghostmind-dev/block";
import { mount } from "@ghostmind-dev/block/web";

// What this app lends its blocks. In the block it is window.relay.
const relay = defineHost({ name: "relay", calls: ["things", "act"], events: ["change"] });

const block = await mount(container, html, {
  host: relay,
  handlers: { things: () => readThings(), act: ({ thing, action }) => run(thing, action) },
  loader: makeLoader(), // brings the libraries a block names: <!-- relay:use chart.js@4 -->
});
block.emit("change", things);
```

In the block:

```html
<!-- relay:use chart.js@4 -->
<script>
  const things = await relay.things();
  relay.on("change", (things) => draw(things));
</script>
```

Outside a web page (a server that renders the document, a React Native web view), use the parts `mount` is made of: `parse`, `documentOf` and `serve`.

## An app's own functions

The package knows no app's functions. An app names the ones it lends and gives a function for each; the block gets them under the app's name, with the arguments as the app wrote them.

```js
// Potion lends its notes. Tags would lend a checkpoint the same way: defineHost({ name: "tags", calls: ["checkpoint"] }).
const potion = defineHost({ name: "potion", calls: ["getRecords", "openNote"], watches: ["watchRecords"] });

await mount(container, html, {
  host: potion,
  handlers: {
    getRecords: (structure, options) => api.records(structure, options),
    openNote: (id, section) => router.open(id, section),
    // A watch gets the block's function and returns the one that ends it.
    watchRecords: (structure, options, onChange) => api.subscribe(structure, options, onChange),
  },
  rate: { calls: 300, per: 10_000 }, // optional: a block that asks more often is refused
});
```

```html
<script>
  const books = await potion.getRecords("books", { limit: 20 });
  const stop = potion.watchRecords("books", {}, (rows) => draw(rows));
</script>
```

- **A call** answers once, with a promise. It is told it took too long after 30 s (`timeout`).
- **A watch** gives the block a function that stops it, at once, and answers through the functions the block passed. It ends when the block stops it or when the frame goes away.
- **A function as an argument**, alone or held by an options object (`{ onError }`), reaches the app's function as a function: calling it sends its value to the block.
- **Bytes** (an `ArrayBuffer`, a typed array) cross as they are, as an argument or as an answer.
- The functions run in the app, with the app's network and session. The frame holds only their names.

## In a native app

A web view has no page around it: the block's document is the top window, and the app is native code on the other side of a channel that carries text. The document and the app's side are the same as on the web; three small things join them.

```js
import { parse, documentOf, defineHost, serve, webviewTarget, fromWebview } from "@ghostmind-dev/block";

const { source, libraries } = parse(html, { names: ["potion"] });
const page = documentOf(source, { host, libraries: await bring(libraries), transport: "webview" });
const served = serve(host, webviewTarget((js) => webRef.current?.injectJavaScript(js)), handlers, { onHeight, onLink });

<WebView
  source={{ html: page }}
  onMessage={(event) => served.receive(fromWebview(event.nativeEvent.data))}
  onShouldStartLoadWithRequest={(request) => request.url === "about:blank"}  // the block goes nowhere
/>
```

- The same `handlers` as on the web, written once and used by both.
- Bytes (a map tile) cross the text channel as base64 and are bytes again in the block.
- What `PAGE_POLICY` is on a web page, the web view does here: it refuses every navigation after the first load.

## The page around a block

One thing is the page's to do, because nothing inside the frame can: close its own `frame-src`. A block's script may set its frame's `location` to an outside address, with whatever the block was lent written in that address. The frame's policy does not cover that; the page's does.

```html
<meta http-equiv="Content-Security-Policy" content="frame-src 'none'">
```

That is `PAGE_POLICY`. A frame written with `srcdoc` is not refused by it. An app that shows other frames (a video) lists them instead of `'none'`; what matters is that the list is closed.

Other things a page does for a block, all through `mount`:

- `onLink(href)`: a link was clicked. The frame goes nowhere, so the app decides what opens.
- `expand(true)`: the block takes the whole container (the screen) for a while, where it is. It scrolls inside itself, is told (`<html data-block-expanded>`), and passes Escape on (`onEscape`).
- `scale(1.2)`: the reader's text size. The block is zoomed, not loaded again.

## Libraries

A block names what it needs on its first lines and gets each as a global:

```html
<!-- block:use chart.js@4 -->                                                    Chart
<!-- block:use three@0.186, three@0.186/addons/controls/OrbitControls.js -->     THREE, THREE.OrbitControls
<!-- block:use canvas-confetti@1 as confetti, leaflet@1.9/dist/leaflet.css -->   a name the block chose; a stylesheet
```

Any package on npm can be named. The frame is what keeps a block in, not a list of names. The catalogue (`lib/app/src/catalogue.js`) is what was learned about the ones that were tried.

## Slots

A slot is a place of an app and the room a block has there. The app declares it once; `mount` keeps the block inside it, and `slotText` says the same numbers to whoever writes the block.

```js
const hover = defineSlot({ name: "hover", what: "the box under the mouse", width: { max: 320 }, height: { max: 360 }, shrink: true, interactive: false });
await mount(container, html, { slot: hover });
slotText(hover); // "hover: the box under the mouse. It is at most 320 px wide, at most 360 px tall: …"
```

## Writing a block with a model: the layout chat

**The reference for every app.** A new app that lets a person make html blocks (a layout for a place, a card, a dashboard) takes this as its model: the package for the frame and the shared parts, and block's `/make` for the way a layout is made. block is where it is built and tried first.

block's web app has a chat that writes a block and draws it while it is written (`/make`). The parts that are not block's own are in the package, so tags, Potion and Relay build the same chat on their side without a copy of the rules or of the loop.

**One layout, one place.** The person chooses the place before the chat starts (a slot: in tags, the panel of a place or the bubble on the map), and the draft keeps it. The model is told that place only; another place is another layout.

**Data through a function, mocked while it is made.** A layout shows one object, which it asks for with `await <app>.self()`, never written into its source. While it is made, the app answers with the draft's `sample`: made-up data the model writes, and the person edits in the Data tab. Applied in an app, the app's own `self()` answers with the real object. The sample's shape is the layout's contract (`shapeOf`), and nothing in it is required: a value the app does not have is simply not drawn. In block itself, there is no real object: a published block keeps its sample, and `block.self()` answers it.

**In the package** (plain JS, no dependency):

- `selfHost(name)`: the host of a layout that shows one object, `window.<name>.self()`. `shapeOf(sample)`: what a layout asks for, read from its sample (`title` text, `opens` date, `hours[].day` text…).

- `instructions({ slots, host, calls, sample, extra })`: what a model is told to write a block for this app: the shared `RULES`, the app's slots (`slotText`), what its host lends (with a sentence per call), a sample of the data a block is drawn with, and the app's own rules.
- `sourceProblems(source, { slot, names })`: what is seen wrong before a block is drawn or kept, in words a model can act on: a fence, the network, a script or a picture by address, an import, storage, eval, an unpinned library, and in a slot as tall as its content, `vh`, `height: 100%` on html or body, `position: fixed`.
- `DRAFT_TOOLS` (`read_draft`, `write_draft` with the source, the name and the sample but never the place, `publish_draft` marked `write`), `asFunctions(tools)` for a model's function calls, and `publishing(draft, args)`: what a publish will do, in the sentence the person approves.
- `runTurn({ converse, tools, run, describe, system, messages, text, approve })`: one turn of a chat with tools. Reads run at once; a write stops the turn as `pending` until the next request approves it; a refusal is told to the model. The server keeps nothing: the conversation travels with each request.

**What stays the app's:**

- The model call (`converse`): the person's own OpenRouter key, the model they chose and never a swap, the cost. block's is `mcp/app/src/ai/` (as tags': `shared/server/ai-*.ts`), by the system's OpenRouter guide.
- Where the draft is kept and what a publish saves. block keeps one draft per person (`drafts`, its `version` goes up at each write) and publishes it as a block; Potion keeps one per workspace (`layout_drafts`) and publishes a layout. An app with objects that use a layout says how many in `based_on.used_by`, and `publishing` says it to the person.
- Its host (`defineHost`), the sample a block is drawn with, its own tools (tags' `find_objects`, Potion's notes), its screens.

**The loop.** Every writer writes the one draft: the chat at each `write_draft`, an agent through the MCP (`read_draft`, `write_draft`, `load_draft`, `publish_draft` with `confirm`), the person in the code pane. The open page asks for the draft's version each second (`GET /api/draft?since=12` answers 204 while it is still 12) and draws it again when it changed, so a block changes while the model is still working, whoever writes it.

**An app plugging in:**

```js
import { instructions, DRAFT_TOOLS, asFunctions, runTurn, sourceProblems, publishing } from "@ghostmind-dev/block";

const system = [appRole, instructions({ slots: [detail, hover], host: TAGS_HOST, calls: { self: "the object this layout shows" }, sample })].join("\n\n");
const tools = [...DRAFT_TOOLS, ...appTools];
const turn = await runTurn({
  converse: ({ messages }) => ai.converse({ messages, tools: asFunctions(tools) }),   // the app's OpenRouter call
  tools,
  run: (name, args) => runAppTool(name, args),            // write_draft: save the draft, answer sourceProblems(source, { slot })
  describe: (name, args) => ({ summary: publishing(draft, args) }),
  system, messages, text, approve,
});
```

## Run

Dev runs on the current kube and Docker contexts, as they are: which cluster is current is your choice, and nothing here switches or names one. It must be a cluster that runs the shared Postgres and the users service; `k8s/dev-setup.sh` asks it and stops otherwise.

```sh
run routine test      # in lib/: the package's tests
run routine start     # in db/: Hasura; then `run routine migrate`
run routine dev       # in mcp/, ui/ and tunnel/: https://block.ghostmind.app is the one host (the tunnel sends /mcp, /oauth and /api to the mcp)
run routine dev       # in demo/: the page on http://localhost:5105
```

The web app is also on http://localhost:5106, and sign-in works from there too (Google sends people back through the tunnel, so the tunnel has to be up).

Claude Code reaches the dev MCP at `https://block.ghostmind.app/mcp`: a session opened in this repo has it as `block-dev` (`.mcp.json`). The plugin's MCP is the prod one.

A dev routine refuses a cluster that has no shared Postgres (`k8s/dev-setup.sh`), so nothing is deployed to a laptop's own cluster by mistake.

## State

- The package brings any npm library, keeps a block in a slot and reports what a block threw. Its tests pass, and the web app shows three.js, a chart and each slot in a browser.
- `db`, `mcp` and `ui` run on the dev cluster. The product's Google sign-in client (project `ghostmind-core`, client `block`) is in Vault at `ghostmind/project/block/auth`.
- Prod is `https://block.ghostmind.dev`, deployed by a merge to main (`.github/workflows/deploy.yaml`): only the apps a merge changed, or everything on a run started by hand. `run routine prod_init` set up the namespace, the Vault roles and the tunnel; run it again when an app or a prod secret path is added.
- Potion, tags.city and Relay all show their blocks through this package, on the web and in their iOS apps (2026-10-13). Where each app's own side is:

  | App | Web | iOS | Version it pins |
  |---|---|---|---|
  | block | `ui/app/src/frame.tsx` (`mount`), `make.tsx` (layouts), `embed.tsx` | none yet | 0.4.0 |
  | Potion | `ui/app/src/lib/potion-block.ts`, `components/HtmlBlockRenderer.tsx`, `MarkdownPreview.tsx` (the feed card) | `native/app/components/elements/HtmlBlock.tsx` | web 0.2.0, iOS 0.3.1 |
  | tags.city | `shared/pure/layout-frame.ts`, `city/app/src/components/layouts/LayoutFrame.tsx`, `app/map/hover-layout.ts` | `native/app/components/elements/LayoutView` | 0.3.1 |
  | Relay | `api/app/src/ui/frame.js`, `dashboards.js` (the package is served to the page from `/ui/block@<version>/`) | `native/app/utils/block.ts`, `app/dashboard/[id].tsx` | 0.3.1 |

- Potion and Relay still bring libraries from their own catalogue and vendor route, not from `makeLoader`; tags.city uses `makeLoader`.

## Next

- An iOS app for block itself.
- tags.city: the contract its MCP and its in-app AI give for a layout (`shared/pure/layout.ts`) does not say that a layout may name libraries (`tags:use`), and there is no tool that lists them.
- Pictures and video from outside a block: an app-owned list of media hosts in the policy, and web pictures brought by the app (tags.city already does the second with `tags.image`).
- One catalogue: Potion and Relay reading this package's loader and catalogue in place of their own.
- A search in `list_libraries` (the npm registry), so a model does not have to guess a package's name.
- A React component and a React Native one around `mount` and `serve`: the three apps each wrote the same few lines.
- Raise the version and publish (`npm publish --access public` in `lib/app`) when `lib/` changes, then raise it in `ui`, `mcp` and each app that uses it.
