---
name: html-block
description: >-
  The rules every html block follows in every Ghostmind app (Potion, tags.city, Relay): the sandbox it
  runs in, how a library reaches it, how it is sized, the ground it is drawn on, and what it may ask of the
  app. Use it whenever you write or fix a ```html block, a layout, a dashboard or a card in one of those apps,
  together with that app's own skill (potion-blocks, tags, relay-dashboards), which says what only that
  app has: its functions, its libraries, its places.
---

# An html block

An html block is one piece of html (markup, a `<style>`, a `<script>`) that an app shows in a sandboxed frame. The same thing is a chart in a Potion note, a layout beside a map in tags.city and a dashboard in Relay. They share one frame, `@ghostmind-dev/block`, and so they share these rules.

This skill is the common part. **Each app has its own skill for what is only its own**; read both:

| App | Its skill | What only it says |
|---|---|---|
| Potion | `potion-blocks` | `window.potion` (notes, records, writes), `potion:use`, the feed section, layouts |
| tags.city | `tags` | `tags.self()`, placements (detail, hover), layouts and presets |
| Relay | `relay-dashboards` | `window.relay` (things, actions), dashboards and covers |

When the two disagree, the app's skill wins: it describes what that app runs today.

## The frame reaches nothing

- **No network.** No `fetch`, no `<script src>`, no `<link>`, no `<iframe>`, no remote font, video or css `url()`. A video or a post of one of five sites is the exception, written as below.
- **A picture by address is written as it is:** `<img src="https://…">`. The app brings it into the block before it is shown (from @ghostmind-dev/block 0.5.0), so a link the person pastes shows. Only an `<img src>` written in the source is brought: an address a script makes at run time (`new Image()`, a css `url()`) is refused. Inline svg, a canvas or a `data:` address work too. Give the `<img>` a size or `max-width: 100%`, and an `alt`.
- **No storage, no page.** No `localStorage`, no cookies, no access to the page around it, no `eval`.
- **It cannot go anywhere.** A link does nothing by itself. The app decides what a link opens, and each app says which links it understands.

Design for this; do not look for a way round it. What a block needs from outside, the app lends it.

## Players: YouTube, Vimeo, Spotify, Reddit, Instagram

From @ghostmind-dev/block 0.7.0, a block shows a video or a post with the address a person would share (the one a note's `::embed[…]` takes), in every app:

```html
<block-embed id="video" src="https://youtu.be/d6c6uIyieoo" title="Riemann Hypothesis - Numberphile"></block-embed>
<nav><button data-at="125">2:05 the primes</button><button data-at="420">7:00 the zeta function</button></nav>
<script>
  const video = document.querySelector("#video");
  document.querySelector("nav").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-at]");
    if (b) { video.seek(Number(b.dataset.at)); video.play(); }
  });
</script>
```

- **Addresses that work:** YouTube (`youtu.be/…`, `youtube.com/watch?v=…`, `/shorts/…`, with `?t=90` or `?t=1m30s` to start there), Vimeo (`vimeo.com/123…`), Spotify (`open.spotify.com/track|album|playlist|episode|show|artist/…`), Reddit (`reddit.com/r/<sub>/comments/<id>/…`), Instagram (`instagram.com/p/…` or `/reel/…`). Nothing else plays, X included; another address shows a line that says so.
- **Never an `<iframe>`**, even of these sites: the frame refuses it. Only `<block-embed>`.
- **Size:** as wide as its room. A video keeps 16:9 (9:16 for a Short); Spotify, Reddit and Instagram have a height of their own, which `height="400"` changes. Put it in a box to make it narrower (`max-width`).
- **Moving it:** `seek(seconds)`, `play()`, `pause()` on the element, for YouTube and Vimeo. The block cannot read the player (its time, its state).
- On a web page the player is laid by the app over the spot the block leaves, so nothing of the block can be drawn over it: no caption or button on top of a video, put them beside it.

## What the app lends

A block talks to its app through one object with the app's name: `potion`, `tags`, `relay`. It holds only the functions that app declared, and they answer with a promise.

```html
<script>
  const rows = await potion.getRecords("books", { limit: 20 });
</script>
```

- Guard for its absence (`if (!window.potion)`) and show something static: a block may be shown where nothing is lent.
- A function that is not in the app's skill does not exist. Do not guess names.
- A call can fail or be refused; show the reason (`error.message`), never an empty box.
- **Args.** Where an app draws one block many times, each copy with its own values (a caption, a record), the block reads them with `potion.args()`: a plain object of strings, numbers and booleans, answered at once (not a promise), `{}` when the app gave none. Give each one a default: `const { caption = "" } = potion.args();`.

## Libraries

A library is named on the block's first lines, with the app's name, and **arrives as a global**. `import` and `<script src>` do not work.

```html
<!-- potion:use chart.js@4 -->
<script>new Chart(document.querySelector("canvas"), { … });</script>
```

- Which libraries an app accepts, the global each arrives as, and what goes wrong with it in a frame come from that app's library tool (`list_block_libraries`, `list_dashboard_libraries`, `list_libraries`). Call it before using one.
- Pin a version (`chart.js@4`), never `latest`: a block is kept for years.
- A library that fetches, stores or uses `eval` will not work, whatever its name.
- Plain html, css and inline svg come first. A library is for when they are not enough.

## The room

A block is written for the place it is shown in, and the app's skill says how much room that is.

- **As tall as its content**, in most places. `100vh`, `height: 100%` and `position: fixed; inset: 0` have nothing to refer to there: they take the frame's height, which is the block's own, and the frame stays a sliver. A canvas, a chart or a 3D scene needs a parent with a height of its own (`aspect-ratio: 16 / 9`, or pixels), with its overlays `position: absolute` inside it. Write it like a page only where the app's place fills the frame.
- **No height limit.** A block is as tall as its content, however long (from @ghostmind-dev/block 0.6.1): a long scrolling page is one block, with no need to split it into tabs. Only a place the app declares with a most it may be stops it there, and past that an interactive block scrolls inside itself. A height that climbs on its own with nothing new in it (a chart sized to its own box, a section of `100vh`) is held where the climb began, so size such things in px or with `aspect-ratio`.
- **A block may be narrower than its frame.** `max-width: 420px; margin: 0 auto` on a top-level element makes a centered card (from @ghostmind-dev/block 0.6.1). 100% is only the default for elements with no limit of their own, and what is wider than the frame scrolls sideways inside it.
- **The room arrives late and changes.** A block starts before its frame has its real size, and the size changes after (a panel dragged, a phone turned, the block expanded to the screen). Size anything a script measures from its parent, inside a `ResizeObserver` on that parent. Never once at the start, never from `window`.
- **Lay out with what flows**: `%`, flex, grid, `clamp()`. It must hold at the narrowest and the widest the place allows.
- **Nothing shown, no room.** A block that hides everything it drew (`display: none`, a card whose record is gone) takes no height at all, unless the place keeps some. Hide the block's content to make it disappear, rather than leaving an empty box.
- **A card drawn from values starts hidden and shows itself last.** Where a block is one copy of many (a card from its args or a record), put `hidden` on its root and remove it as the script's last line, once every value is set. Missing values, a thrown error or a script that does not parse then leave nothing, never a half-filled or empty card, and the app collapses it. `hidden` loses to any `display` the block's own CSS gives that element (`.card { display: flex }` shows a "hidden" card): add `.card[hidden] { display: none }`.
- **Expanded**, where the app offers it, the block is told on `<html>` (`data-block-expanded`, and under the app's name: `data-potion-expanded`). Only there does `vh` mean the screen.

## The ground

The app may be light or dark, and the ground is not white.

- **Inherit it**: transparent ground, `color: inherit`, `currentColor`, greys such as `rgba(127,127,127,.25)`. Read the ink with `getComputedStyle(document.body).color` when a library wants a colour.
- **Or own it**: paint a ground of your own and every colour on it.
- `prefers-color-scheme` works. Never assume one.

## Never an empty box

- Draw something before any animation or any answer arrives.
- Write the fallback for what may be missing: the library, the app's object, WebGL, data.
- Honour `prefers-reduced-motion`, and stop a loop when the block is off screen (`IntersectionObserver`): a page may show many blocks.
- Sound starts only after a click inside the block.
