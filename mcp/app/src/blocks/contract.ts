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
6. Never leave an empty box: draw something before any animation starts, and write the fallback for what may be missing.`;
