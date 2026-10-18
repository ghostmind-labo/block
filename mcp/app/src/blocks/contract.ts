import { slotsInWords } from "./slots.ts";

/** What a block is, for whoever writes one. Said once here, and given by the tools that take a source. */
export const CONTRACT = `THE CONTRACT
1. A block is one text of html: markup, a <style> and a <script>, as a fragment or a whole document. No \`\`\` fence.
2. It runs in a frame that reaches nothing: no network (no fetch, no <script src>, no <link>, no remote image or font: data: addresses only), no storage (no localStorage, no cookies), no access to the page around it, no eval and no new Function.
3. A library is asked for on the first lines, never loaded by the block itself: <!-- block:use chart.js@4 -->. Any package on npm may be named, several separated by commas. It arrives as a GLOBAL, never by import: \`Chart\`, \`THREE\`, \`d3\`. list_libraries says which global, and what was learned about the ones that were tried.
4. It is written for ONE SLOT, the place it is shown in, which decides its room:
${slotsInWords()}
   The slot's name is on <html data-block-slot="…">, for a block drawn differently in two places.
5. The ground is the app's, light or dark, and it is not yours to assume. Either inherit it (transparent ground, \`color: inherit\`, \`currentColor\`, translucent greys such as rgba(127,127,127,.25)) or own it (paint a ground of your own and every colour on it). \`prefers-color-scheme\` works; never assume white.
6. Never leave an empty box: draw something before any animation starts, and write the fallback for what may be missing.
7. The room is a range, not a number, and it changes: a panel is dragged wider, a phone is turned, and the frame gets its real size a moment AFTER the block starts. So lay out with what flows (%, flex, grid, \`clamp()\`, \`min()\`), never with one fixed width, and it must hold at the narrowest and at the widest the slot allows. Whatever a script measures (a canvas, a chart, a 3D renderer) is sized from its parent, with a \`ResizeObserver\` on that parent: not once at the start, and not from \`window\`.
8. In every slot but one that fills its frame, the frame is as tall as what the block lays out. \`100vh\`, \`height: 100%\` and \`position: fixed; inset: 0\` take the frame's height, which is the block's own: the block has none, and the frame would stay a sliver. A canvas or a 3D scene sits in a parent that has a height: \`#stage { position: relative; aspect-ratio: 16 / 9; }\` (or a height in px), overlays positioned \`absolute\` inside it. A block with no height of its own is shown 16:9 of its width, which is a guess and not a choice.`;
