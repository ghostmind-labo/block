import { bringPictures, documentOf, parse, type Slot } from "@ghostmind-dev/block";
import { DIRECTIVES, loader, pictures } from "./frame";

// A block as one piece of html that needs nothing: its libraries, its data and the frame's rules, all inside. It
// calls no server and no database, so it looks the same wherever it is pasted, for as long as it is kept: a block
// here is deterministic, and `block.self()` answers the data it was published with.

const inScript = (text: string) => text.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
const attribute = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** The whole document (a page of its own), and the snippet that shows it in another page. */
export async function embedOf(block: { name: string; source: string; sample?: unknown }, slot: Slot, height: number, scheme: "light" | "dark" = "light"): Promise<{ page: string; snippet: string }> {
  const parsed = parse(block.source, { names: DIRECTIVES });
  const { libraries, problems } = await loader.loadAll(parsed.libraries);
  if (problems.length) throw new Error(`A library could not be brought: ${problems.join("; ")}`);
  // its pictures go inside too: the embed shows them without calling their host
  const shown = await bringPictures(parsed.source, pictures);
  if (shown.problems.length) throw new Error(shown.problems.join("; "));
  // block.self() answers the block's own data, written into the document: no call leaves it
  const data = `<script>window.block={self:function(){return Promise.resolve(${inScript(JSON.stringify(block.sample ?? null))})},on:function(){return function(){}}};</script>`;
  // Its own ground, light or dark, chosen once: the page it is pasted in, and whoever looks at it, change nothing.
  const ground = scheme === "dark" ? "html { background: #17171a; color: #e8e6e1; }" : "html { background: #ffffff; color: #26262a; }";
  const page = documentOf(data + shown.source, { libraries, slot, mode: "inline", scheme, style: `${ground} body { font: 15px/1.5 ui-sans-serif, system-ui, sans-serif; }` });
  const width = slot.width?.max ? `max-width:${slot.width.max}px;` : "";
  const snippet = [
    `<iframe sandbox="allow-scripts" title="${attribute(block.name)}" data-block style="display:block;border:0;width:100%;${width}height:${height}px" srcdoc="${attribute(page)}"></iframe>`,
    `<script>addEventListener("message",function(e){var f=document.querySelectorAll("iframe[data-block]");for(var i=0;i<f.length;i++)if(e.source===f[i].contentWindow&&e.data&&e.data.type==="block-height")f[i].style.height=e.data.height+"px"})</script>`,
  ].join("\n");
  return { page, snippet };
}
