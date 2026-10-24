# block

The sandboxed html block that Potion, Relay and Tags each built for themselves, as one package: the document a block runs in, the libraries it may name, and the functions its host app lends it.

A block is html written by a person or a model. It is shown in a frame that reaches nothing: no network, no storage, not the page around it. Whatever it needs from outside, the app lends it by name.

It is open source (MIT) and published on npm as [`@ghostmind-dev/block`](https://www.npmjs.com/package/@ghostmind-dev/block): plain ESM JavaScript, no dependency, no build. The same code runs in a browser, in Node and in a native app's web view.

| Folder | What it is |
|---|---|
| `lib/` | `@ghostmind-dev/block`, the npm package, and its tests |
| `demo/` | A page with no build that mounts one block and lends it its scroll, reading the package's source as it is on disk (http://localhost:5105) |
| `plugin/` | A Claude plugin with the `html-block` skill: the rules every block follows, in every app |

```sh
npm install @ghostmind-dev/block
```

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
- **Args**: one block, many copies, each with its own values. `mount(container, html, { host, args: { caption: "From the car" } })` (or `documentOf(source, { host, args })`, in a web view too) and the block reads `potion.args()`: a copy of them, at once, not a promise, and `{}` when the app gave none, so a block may always call it. A flat object of strings, numbers and booleans; they are written in the document as data. `args` is therefore not a name a host may give a call.

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

## Pictures by address

A block may show a picture by its address, written as it is: `<img src="https://…">`. The frame still loads nothing; the page brings each address written in the source before the frame is made, and writes it in as `data:`. An address a script makes at run time is refused by the frame, as before.

```js
import { makePictures } from "@ghostmind-dev/block";
const pictures = makePictures({ relay: (address) => fetch(`/api/picture?url=${encodeURIComponent(address)}`) });
await mount(container, html, { loader, pictures, … });          // bringPictures(source, pictures) for an html of your own
```

The page fetches from the picture's host. A host that refuses other sites (no CORS) is asked through the app's own route, which says who may ask and calls the package:

```js
import { relayPicture, PictureError } from "@ghostmind-dev/block/server";
app.get("/api/picture", async (req, res) => {
  // who may ask is the app's: here, someone signed in
  const { type, bytes } = await relayPicture(String(req.query.url));   // https, public addresses only, pictures only, 5 MB
  res.set({ "content-type": type, "cache-control": "private, max-age=86400" }).send(Buffer.from(bytes));
});
```

Nothing is kept by the app: the picture comes from its host each time it is shown (the browser keeps it a while). An embed made with `bringPictures` carries its pictures inside.

## Slots

A slot is a place of an app and the room a block has there. The app declares it once; `mount` keeps the block inside it, and `slotText` says the same numbers to whoever writes the block.

```js
const hover = defineSlot({ name: "hover", what: "the box under the mouse", width: { max: 320 }, height: { max: 360 }, shrink: true, interactive: false });
await mount(container, html, { slot: hover });
slotText(hover); // "hover: the box under the mouse. It is at most 320 px wide, at most 360 px tall: …"
```

A block that shows nothing (a card that hid itself) reports a height of 0 and its frame takes no room, unless its slot has a `height.min`. A frame on a page that is not showing has no size and reports nothing.

## Writing a block with a model: the chat

An app that lets a person make html blocks with a model (a layout for a place, a card, a dashboard) builds its chat from the parts here, so tags, Potion and Relay share the rules and the loop without a copy of them.

**One layout, one place.** The person chooses the place before the chat starts (a slot: in tags, the panel of a place or the bubble on the map), and the draft keeps it. The model is told that place only; another place is another layout.

**Data through a function, mocked while it is made.** A layout shows one object, which it asks for with `await <app>.self()`, never written into its source. While it is made, the app answers with the draft's `sample`: made-up data the model writes, and the person edits in the Data tab. Applied in an app, the app's own `self()` answers with the real object. The sample's shape is the layout's contract (`shapeOf`), and nothing in it is required: a value the app does not have is simply not drawn.

**In the package** (plain JS, no dependency):

- `selfHost(name)`: the host of a layout that shows one object, `window.<name>.self()`. `shapeOf(sample)`: what a layout asks for, read from its sample (`title` text, `opens` date, `hours[].day` text…).

- `instructions({ slots, host, calls, sample, extra })`: what a model is told to write a block for this app: the shared `RULES`, the app's slots (`slotText`), what its host lends (with a sentence per call), a sample of the data a block is drawn with, and the app's own rules.
- `sourceProblems(source, { slot, names })`: what is seen wrong before a block is drawn or kept, in words a model can act on: a fence, the network, a script or a picture by address, an import, storage, eval, an unpinned library, and in a slot as tall as its content, `vh`, `height: 100%` on html or body, `position: fixed`.
- `DRAFT_TOOLS` (`read_draft`, `write_draft` with the source, the name and the sample but never the place, `save_draft` marked `write`), `asFunctions(tools)` for a model's function calls, and `saving(draft, args)`: what a publish will do, in the sentence the person approves.
- `runTurn({ converse, tools, run, describe, system, messages, text, approve })`: one turn of a chat with tools. Reads run at once; a write stops the turn as `pending` until the next request approves it; a refusal is told to the model. The server keeps nothing: the conversation travels with each request.

**What stays the app's:**

- The model call (`converse`): the person's own key, the model they chose and never a swap, the cost.
- Where the draft is kept and what a save keeps (Potion keeps one draft per workspace and publishes a layout). An app with objects that use a layout says how many in `based_on.used_by`, and `publishing` says it to the person.
- Its host (`defineHost`), the sample a block is drawn with, its own tools (tags' `find_objects`, Potion's notes), its screens.

**The loop.** Every writer writes the one draft: the chat at each `write_draft`, an agent through the app's MCP, the person in a code pane. The open page draws the draft again whenever its version changes, so a block changes while the model is still working, whoever writes it.

**An app plugging in:**

```js
import { instructions, DRAFT_TOOLS, asFunctions, runTurn, sourceProblems, saving } from "@ghostmind-dev/block";

const system = [appRole, instructions({ slots: [detail, hover], host: TAGS_HOST, calls: { self: "the object this layout shows" }, sample })].join("\n\n");
const tools = [...DRAFT_TOOLS, ...appTools];
const turn = await runTurn({
  converse: ({ messages }) => ai.converse({ messages, tools: asFunctions(tools) }),   // the app's OpenRouter call
  tools,
  run: (name, args) => runAppTool(name, args),            // write_draft: save the draft, answer sourceProblems(source, { slot })
  describe: (name, args) => ({ summary: saving(draft, args) }),
  system, messages, text, approve,
});
```

## Run it locally

```sh
cd lib/app && npm test      # the package's tests (node:test, no browser: the frame's scripts run in node:vm)
cd demo/app && PORT=5105 node server.js   # the demo page on http://localhost:5105
```

With the `run` CLI, `run routine test` in `lib/` and `run routine dev` in `demo/` do the same through varlock. The demo serves `lib/app/src` under `/block/`, so a change to the package shows on a reload. A change to the document or to `mount.js` is checked on that page in a browser before it is published.

## Publish

Raise `version` in `lib/app/package.json`, run the tests, then `npm publish --access public` in `lib/app`. Each app that uses the package raises its own pinned version.

## Used by

Potion, tags.city and Relay show their blocks through this package, on the web and in their iOS apps.

## Next

- One catalogue: Potion and Relay still keep their own copy of it. Potion no longer refuses a name (2026-10-24): what its copy does not hold it brings through `makeLoader`, kept in its bucket, with `as` and file paths. Relay still offers only its copy.
- A React component and a React Native one around `mount` and `serve`: each app wrote the same few lines.
- A search of the npm registry, so a model does not have to guess a package's name.
