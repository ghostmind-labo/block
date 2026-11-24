# @ghostmind-dev/block

A sandboxed html block: one piece of html, written by a person or a model, shown in a frame that reaches nothing. No network, no storage, not the page around it. Whatever it needs from outside, the app lends it by name.

Plain ESM JavaScript, no dependency, no build. The same code runs in a browser, in Node and in a native app's web view.

- `@ghostmind-dev/block`: `parse`, `documentOf`, `coverOf`, `defineHost`, `serve`, `defineSlot`, `makeLoader`, and the policy (`SANDBOX`, `POLICY`, `PAGE_POLICY`)
- `@ghostmind-dev/block/web`: `mount`, a block on a web page
- `@ghostmind-dev/block/catalogue`: what was learned about the libraries that were tried

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


Types come with the package (`src/*.d.ts`, written by hand next to the source: there is no build). A test checks that every export is declared.

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
  onShouldStartLoadWithRequest={(request) => request.url === "about:blank" || !request.isTopFrame}  // the block goes nowhere; a player (frame-src) loads
/>
```

- The same `handlers` as on the web, written once and used by both.
- Bytes (a map tile) cross the text channel as base64 and are bytes again in the block.
- What `PAGE_POLICY` is on a web page, the web view does here: it refuses every navigation of the block after the first load. A frame inside it is let through: the block's own policy (`WEBVIEW_POLICY`) lets it frame only the players of `EMBEDS`, and what a player frames is its own.

## The page around a block

One thing is the page's to do, because nothing inside the frame can: close its own `frame-src`. A block's script may set its frame's `location` to an outside address, with whatever the block was lent written in that address. The frame's policy does not cover that; the page's does.

```html
<meta http-equiv="Content-Security-Policy" content="frame-src https://www.youtube-nocookie.com/embed/ https://www.youtube.com/embed/ https://player.vimeo.com/video/ https://open.spotify.com/embed/ https://embed.reddit.com/r/ https://www.instagram.com/p/ https://www.instagram.com/reel/">
```

That is `PAGE_POLICY` (write it from the export, so it follows the package): the players of `EMBEDS`, which `mount` lays over a block (see Players), and nothing else. A frame written with `srcdoc` is not refused by it; a block that sends its own frame away can at most reach one of those players. An app that shows other frames of its own adds them; what matters is that the list is closed.

Other things a page does for a block, all through `mount`:

- `onLink(href)`: a link was clicked. The frame goes nowhere, so the app decides what opens.
- `expand(true)`: the block takes the whole container (the screen) for a while, where it is. It scrolls inside itself, is told (`<html data-block-expanded>`), and passes Escape on (`onEscape`).
- `scale(1.2)`: the reader's text size. The block is zoomed, not loaded again.

## Players: YouTube, Vimeo, Spotify, Reddit, Instagram

A block shows a video or a post with the address a person would share, the one a note's `::embed[…]` takes:

```html
<block-embed id="video" src="https://youtu.be/d6c6uIyieoo?t=90"></block-embed>
<button onclick="document.querySelector('#video').seek(125)">2:05</button>
```

- The element is as wide as its room. A video keeps 16:9 (9:16 for a Short); Spotify, Reddit and Instagram have a height of their own, which `height="…"` changes.
- `seek(seconds)`, `play()` and `pause()` move a YouTube or Vimeo player.
- The sites are a closed list, `EMBEDS`, the same in every app; `embedOf(address)` says what an address becomes, or `null`. Any other address shows a line that says so. X is not on the list: its player draws nothing on its own, even straight in a page.
- A player cannot run inside the block's frame: a frame nested there inherits its sandbox and has no origin of its own, and YouTube and Reddit refuse to play like that. So on a web page the block only leaves a spot and tells the page where it is; `mount` lays the site's player over it, in a frame of the page's own, clipped to the block's frame. The page turns the address into the player's itself, so the block never chooses what is framed beyond an address of the list, and reaches the player only through seek, play and pause. The sandbox and the block's policy are unchanged: the block still frames nothing.
- In a native app's web view, the document is not sandboxed: the block frames the player itself (`WEBVIEW_POLICY` lists the players in its `frame-src`).

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

A block has no height limit but its slot's: with no slot, or a slot with no `height.max`, the frame is as tall as the content, however long. Past a slot's `height.max`, an interactive block scrolls inside itself and one that is only looked at is cut off. A height that climbs on its own (a chart sized to its box, a section of `100vh`: 30 rises in a row over more than 1.5 s with no node, text, picture, font or input in between) is held where the climb began, and the block scrolls inside itself until something new arrives.
