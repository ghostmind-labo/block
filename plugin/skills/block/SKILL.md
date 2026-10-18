---
name: block
description: >-
  Make html blocks and layouts through the block MCP: a block from a layout and its data (list_layouts,
  create_block_from_layout, set_block_data), a layout written live (new_draft, write_draft, read_draft,
  load_draft, publish_draft), or a one-off block (create_block, update_block, get_block, list_blocks).
  Use when the person asks for something to look at or play with that text cannot be: "make a new pizza
  place", "a card for this café", "make me a chart of…", "a little page for…", "a dashboard", "draw…", "a
  3D…", "a small game", "a layout for…", or asks to change, share or embed one they already have. Also use
  when a block shows wrong: blank, clipped, the wrong size, white on white, or an error under it.
---

# Block

A block is one piece of html (markup, a `<style>`, a `<script>`) shown in a sandboxed frame, at its own address. block is the showcase and test bench of `@ghostmind-dev/block`, the package every app (Potion, tags.city, Relay) shows its blocks with, and the place layouts are made the way every app will make them.

The rules common to every app's blocks (the sandbox, libraries, sizing, the ground) are the `html-block` skill, beside this one. This skill is block's own: its tools, layouts, and blocks made from them.

## Layouts and blocks

- **A layout is a template**: a source, a room (a width and a height, set by the person) and fields: the data the layout shows, which it asks for with `await block.self()` and never writes into its source (`name` text, `rating` number, `opens_at` date, `tags` list). In an app, `self()` is the app's own data (`potion.self().name`); in block there is no app behind it.
- **A block made from a layout** is the layout and its own data: what `block.self()` answers in it, written once, by the person or by you, on the spot. "Make a new pizza place" is the place layout with the pizza place's name, hours and rating. It is drawn with the layout's source as it is now: improving the layout improves every block made from it.
- **A one-off block** has its source and its data together (`create_block`): for what will not be made twice.

## The way to work

**"Make a new <thing>", "a card for <this>"**: a block from a layout.

1. `list_layouts`: the templates, with their fields. Pick the one that fits; when none does, say so and offer to make one (below).
2. `create_block_from_layout` with the layout, a name and the data: its fields, filled with real values when the person gave them (or you know them), realistic ones otherwise. Leave out what you do not know: a missing value is not drawn. A key the layout does not read is refused.
3. Give the person the `url`. To change the data later: `get_block` (its `sample`), then `set_block_data`.

**"A layout for…", "change the layout"**: the live draft. The person watches it at `/make`, drawn again at each write.

1. A new layout: `new_draft` with its room (`width` or `max_width`, `height` or `max_height`; none: full width, as tall as its content) and its fields. Ask the person for both when they did not say. An existing one: `load_draft` with its id.
2. `write_draft`: first the `sample` (made-up data with exactly the fields), then the `source` that reads it, then improve it step by step. Each write is drawn; the answer has `problems` (fix them) and `advice` on fitting the room.
3. `publish_draft` only when the person asks: without `confirm` it says what it would do (a new layout, or the one it was loaded from replaced); tell them, then call it with `confirm: true`.

**A one-off block**: `create_block`, then the `url`. To change it: `get_block`, then `update_block` with the whole new source. A block made from a layout is changed through its layout, or its data with `set_block_data`.

## Which tool

| The person wants | Tool |
|---|---|
| a new pizza place, café, trip… | `list_layouts`, then `create_block_from_layout` |
| "change its hours", "it's 4.5 stars now" | `get_block`, then `set_block_data` |
| a new layout, a template | `new_draft`, then `write_draft` |
| "change the layout", "make the stars smaller" | `load_draft`, `write_draft`, then `publish_draft` |
| something made once | `create_block` |
| "send it to someone", "embed it" | `update_block` with `shared: true`, then give the url; the embed code is on its page at `/make` (Embed, only once shared) |
| "what do I have" | `list_layouts`, `list_blocks` |
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

- **Data comes from `block.self()`, never from the source.** A layout that writes "Café Olimpico" into its html is not a layout: it cannot be filled with another place. Read every value from `self()`, and draw nothing for one that is missing (no "undefined", no error).
- **Height.** Unless its room has an exact height, the frame is as tall as the content. `100vh`, `height: 100%` and `position: fixed; inset: 0` have nothing to refer to then: they take the frame's height, and the frame takes the block's. A chart, a canvas or a 3D scene needs a parent with a height of its own:

  ```html
  <style>
    #stage { position: relative; aspect-ratio: 16 / 9; }                 /* a height of its own, from its width */
    #stage canvas { display: block; width: 100%; height: 100%; }
    #bar { position: absolute; left: 12px; right: 12px; bottom: 10px; }  /* overlays inside the stage, never fixed */
  </style>
  <div id="stage"><div id="bar">…</div></div>
  ```

  The renderer is sized from `#stage` in a `ResizeObserver`. A block with no height at all is shown 16:9 of its width by the package, but that is a guess: give it the shape you mean.
- **The room arrives late, and changes.** A block starts before its frame has its real size. Size what a script measures from its parent inside a `ResizeObserver`, and lay the rest out with `%`, flex, grid and `clamp()`: it must hold at the narrowest and the widest the room allows.
- **The ground is not white.** The page may be light or dark. Either inherit (transparent ground, `currentColor`, greys such as `rgba(127,127,127,.25)`), or paint a ground of your own and every colour on it.
- **Nothing remote.** A picture is inline svg, a canvas drawing, or a `data:` address. A remote `<img>` shows nothing.
- **An empty box is a thrown error.** The page shows the error under the frame; ask the person what it says if the block is blank, and do not guess.
- **A library that could not be brought saves nothing.** The answer names it. Fix the name or the version, or leave it out.

## Not here

A block here reaches no app's data: it has no `window.potion`, `tags` or `relay`. A layout that reads a person's notes, places or devices is written in that app, with that app's own skill; it is made the same way (a room, fields, `<app>.self()`).
