---
name: html-block
description: >-
  The rules every html block follows in every Ghostmind app (Potion, tags.city, Relay, block): the sandbox it
  runs in, how a library reaches it, how it is sized, the ground it is drawn on, and what it may ask of the
  app. Use it whenever you write or fix a ```html block, a layout, a dashboard or a card in one of those apps,
  together with that app's own skill (potion-blocks, tags, relay-dashboards, block), which says what only that
  app has: its functions, its libraries, its places.
---

# An html block

An html block is one piece of html (markup, a `<style>`, a `<script>`) that an app shows in a sandboxed frame. The same thing is a chart in a Potion note, a layout beside a map in tags.city, a dashboard in Relay and a block in the block app. They share one frame, `@ghostmind-dev/block`, and so they share these rules.

This skill is the common part. **Each app has its own skill for what is only its own**; read both:

| App | Its skill | What only it says |
|---|---|---|
| Potion | `potion-blocks` | `window.potion` (notes, records, writes), `potion:use`, the feed section, layouts |
| tags.city | `tags` | `tags.self()`, placements (detail, hover), layouts and presets |
| Relay | `relay-dashboards` | `window.relay` (things, actions), dashboards and covers |
| block | `block` | the block app's MCP and its slots |

When the two disagree, the app's skill wins: it describes what that app runs today.

## The frame reaches nothing

- **No network.** No `fetch`, no `<script src>`, no `<link>`, no remote font, video or css `url()`.
- **A picture by address is written as it is:** `<img src="https://…">`. The app brings it into the block before it is shown (from @ghostmind-dev/block 0.5.0), so a link the person pastes shows. Only an `<img src>` written in the source is brought: an address a script makes at run time (`new Image()`, a css `url()`) is refused. Inline svg, a canvas or a `data:` address work too. Give the `<img>` a size or `max-width: 100%`, and an `alt`.
- **No storage, no page.** No `localStorage`, no cookies, no access to the page around it, no `eval`.
- **It cannot go anywhere.** A link does nothing by itself. The app decides what a link opens, and each app says which links it understands.

Design for this; do not look for a way round it. What a block needs from outside, the app lends it.

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
- **The room arrives late and changes.** A block starts before its frame has its real size, and the size changes after (a panel dragged, a phone turned, the block expanded to the screen). Size anything a script measures from its parent, inside a `ResizeObserver` on that parent. Never once at the start, never from `window`.
- **Lay out with what flows**: `%`, flex, grid, `clamp()`. It must hold at the narrowest and the widest the place allows.
- **Nothing shown, no room.** A block that hides everything it drew (`display: none`, a card whose record is gone) takes no height at all, unless the place keeps some. Hide the block's content to make it disappear, rather than leaving an empty box.
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
