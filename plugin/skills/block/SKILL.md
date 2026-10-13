---
name: block
description: >-
  Make and change html blocks through the block MCP (create_block, update_block, get_block, list_blocks,
  list_slots, list_libraries). Use when the person asks for something to look at or play with that text
  cannot be: "make me a chart of…", "a little page for…", "a dashboard", "a card for this place", "draw…",
  "a 3D…", "a small game", "make this interactive", or asks to change or share one they already have.
  Also use when a block shows wrong: blank, clipped, the wrong size, white on white, or an error under it.
---

# Block

A block is one piece of html (markup, a `<style>`, a `<script>`) shown in a sandboxed frame. This app keeps blocks, one per row, each at its own address; the same block is what Potion shows in a note, Tags beside a map and Relay as a dashboard.

The tools say what a block may do: `create_block` carries the contract. This skill is what the tools cannot say.

The rules common to every app's blocks (the sandbox, libraries, sizing, the ground) are the `html-block` skill, beside this one. This skill is what is the block app's own: its tools and its slots.

## The way to work

1. **Choose the slot first.** Call `list_slots` unless the person plainly wants a page of its own. The slot decides everything about the layout: a block written for `page` does not fit in `hover`.
2. **Plain html first.** Html, css and inline svg cover most requests and load at once. Reach for a library when they are not enough, and call `list_libraries` with its name before using it: the answer has the global it arrives as and what goes wrong with it in a frame.
3. **`create_block`**, then give the person the `url` from the answer.
4. **To change one:** `get_block`, edit from the source that is there, `update_block` with the whole new source.

## Which tool

| The person wants | Tool |
|---|---|
| something new | `create_block` |
| "change it", "make the bars blue" | `get_block`, then `update_block` |
| "show it smaller / in a panel / under the mouse" | `update_block` with `slot`, and usually a new `source` written for that room |
| "send it to someone", "make it public" | `update_block` with `shared: true`, then give the url |
| "what do I have" | `list_blocks` |
| "can I use <library>" | `list_libraries` with the name |

## Libraries

- A library is named on the block's first lines and **arrives as a global**. `import` does not work in a block, and neither does `<script src>`.
- Any package on npm can be named. `list_libraries` without a name lists the ones that were tried in a frame; those are the safe choices.
- A file of a package joins that package's global when both are named: `<!-- block:use three@0.186, three@0.186/addons/controls/OrbitControls.js -->` gives `THREE.OrbitControls`. Use the same version for both.
- A package's stylesheet is named as a file: `leaflet@1.9/dist/leaflet.css`.
- A global may be named by the block: `canvas-confetti@1 as confetti`.
- A package that fetches, stores, or uses `eval` will not work, whatever its name. Maps that load tiles from the network are the common case.
- Pin a major version (`chart.js@4`), not `latest`: a block is kept for years.

## Traps

- **Height.** In every slot but `page`, the frame is as tall as the content. `100vh` and `height: 100%` have nothing to refer to there. A chart or a canvas needs a parent with a height in pixels, or it collapses, or grows without end.
- **The room changes, and it arrives late.** A block starts before its frame has its real size, and the size changes afterwards (a panel dragged wider, a phone turned). A canvas, a chart or a renderer sized once at the start is drawn for the wrong room: the first maze made here filled only the middle of its page. Size it from its parent inside a `ResizeObserver` on that parent, and lay the rest out with `%`, flex, grid and `clamp()`. Check the block at the narrowest and the widest its slot allows: the block's page has a width handle for `panel`.
- **The ground is not white.** The app may be light or dark. Either inherit (transparent ground, `currentColor`, greys such as `rgba(127,127,127,.25)`), or paint a ground of your own and every colour on it. Read the ink with `getComputedStyle(document.body).color` when a library wants a colour.
- **`hover` and `card` are looked at, never clicked.** No buttons, no links, no scrolling, nothing that needs the mouse.
- **`hover` takes the width of what is drawn.** Give the outermost element a width in pixels, or the box is as wide as the slot allows.
- **Nothing remote.** A picture is inline svg, a canvas drawing, or a `data:` address. A remote `<img>` shows nothing.
- **An empty box is a thrown error.** The block's page shows the error under the frame; ask the person what it says if the block is blank, and do not guess.
- **A library that could not be brought saves nothing.** The answer names it. Fix the name or the version, or leave it out.

## Not here

A block here reaches no data: it has no `window.potion`, `tags` or `relay`. A block that must read a person's notes, places or devices is written in that app, with that app's own skill.
