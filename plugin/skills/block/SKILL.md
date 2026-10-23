---
name: block
description: >-
  Make and change html blocks through the block MCP: a block written live in the person's draft (new_draft,
  write_draft, read_draft, load_draft, save_draft), or written at once (create_block, update_block, get_block,
  list_blocks). Use when the person asks for something to look at or play with that text cannot be: "a card for
  this café", "make me a chart of…", "a little page for…", "a dashboard", "draw…", "a 3D…", "a small game", or
  asks to change, share or embed one they already have. Also use when a block shows wrong: blank, clipped, the
  wrong size, white on white, or an error under it.
---

# Block

A block is one piece of html (markup, a `<style>`, a `<script>`) shown in a sandboxed frame, at its own address. block is the bench of `@ghostmind-dev/block`, the package every app (Potion, tags.city, Relay) shows its blocks with: a gallery of blocks, and a chat that makes them.

The rules common to every app's blocks (the sandbox, libraries, sizing, the ground) are the `html-block` skill, beside this one. This skill is block's own: its tools.

## The way to work

**"Make me…", "change it so…" while the person watches**: the live draft. The person sees it at `/make`, drawn again at each write.

1. A new block: `new_draft`, with its room when the person gave one (`width` or `max_width`, `height` or `max_height`; none: full width, as tall as its content). An existing one: `load_draft` with its id (`list_blocks`).
2. `write_draft` with the whole source, a first version at once, then step by step. Each write is drawn; the answer has `problems` (fix them) and `advice` on fitting the room.
3. `save_draft` only when the person asks: without `confirm` it says what it would do (a new block, or the one it was loaded from replaced); tell them, then call it with `confirm: true`. Saving shares nothing: a saved block stays private until it is shared.

**One made at once** (the person is not watching, or asked for it done): `create_block`, then give the `url`. To change it: `get_block`, then `update_block` with the whole new source.

## Which tool

| The person wants | Tool |
|---|---|
| a new block, to watch it made | `new_draft`, then `write_draft` |
| "change it", "make the stars smaller" | `load_draft`, `write_draft`, then `save_draft` |
| a block, done | `create_block` |
| "send it to someone", "embed it" | `update_block` with `shared: true`, then give the url; the embed html is on its page (Embed) |
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

- **Height.** Unless its room has an exact height, the frame is as tall as the content. `100vh`, `height: 100%` and `position: fixed; inset: 0` have nothing to refer to then: they take the frame's height, and the frame takes the block's. A chart, a canvas or a 3D scene needs a parent with a height of its own:

  ```html
  <style>
    #stage { position: relative; aspect-ratio: 16 / 9; }                 /* a height of its own, from its width */
    #stage canvas { display: block; width: 100%; height: 100%; }
    #bar { position: absolute; left: 12px; right: 12px; bottom: 10px; }  /* overlays inside the stage, never fixed */
  </style>
  <div id="stage"><div id="bar">…</div></div>
  ```

  The renderer is sized from `#stage` in a `ResizeObserver`. A block with no height at all is shown 16:9 of its width by the package, but that is a guess: give it the shape you mean. A block that shows nothing (everything `display: none`) takes no room at all.
- **The room arrives late, and changes.** A block starts before its frame has its real size. Size what a script measures from its parent inside a `ResizeObserver`, and lay the rest out with `%`, flex, grid and `clamp()`: it must hold at the narrowest and the widest the room allows.
- **The ground is not white.** The page may be light or dark. Either inherit (transparent ground, `currentColor`, greys such as `rgba(127,127,127,.25)`), or paint a ground of your own and every colour on it.
- **Pictures by address show; nothing else remote does.** Write the address the person gives as it is, `<img src="https://…">`: the page brings it in, and through block's server when its host refuses other sites. A picture whose host does not answer is left out and said under the block. Fonts, videos and css `url()` by address are not brought.
- **An empty box is a thrown error.** The page shows the error under the frame; ask the person what it says if the block is blank, and do not guess.
- **A library that could not be brought saves nothing.** The answer names it. Fix the name or the version, or leave it out.

## Not here

A block here reaches no app's data: it has no `window.potion`, `tags` or `relay`, and its content is in its html. A layout that reads a person's notes, places or devices is written in that app, with that app's own skill.
