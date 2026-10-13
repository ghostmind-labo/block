import { describe, slotText } from "@ghostmind-dev/block";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { User } from "../auth/google.ts";
import { bring, sourceProblem } from "../blocks/check.ts";
import { CONTRACT } from "../blocks/contract.ts";
import { DEFAULT_SLOT, SLOT_NAMES, SLOTS, slotNamed } from "../blocks/slots.ts";
import { createBlock, deleteBlock, getBlock, listBlocks, updateBlock } from "../blocks/store.ts";
import { env } from "../env.ts";

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
const failure = (error: unknown) => ({ ...text(`Error: ${(error as Error).message}`), isError: true });

const WHAT_A_BLOCK_IS =
  "A block is one piece of html (markup, style and script) shown in a sandboxed frame: a chart, a small page, a widget, a drawing, a game. It is the same block Potion shows in a note, Tags beside a map and Relay as a dashboard; this app is where one is made and looked at on its own.";

const slotSchema = z.enum(SLOT_NAMES).describe(`The place it is shown in, which decides its room: ${SLOT_NAMES.join(", ")}. list_slots says how much room each one is`);
const sourceSchema = z.string().min(1).describe("The html of the block. See THE CONTRACT in the tool description");

/** A source that can be kept: it is not too large, and every library it names can be brought. */
async function checked(source: string) {
  const problem = sourceProblem(source);
  if (problem) throw new Error(problem);
  const { libraries, problems } = await bring(source);
  if (problems.length) throw new Error(`a library this block names could not be brought, so nothing was saved: ${problems.join("; ")}. Fix the name or the version (list_libraries with a name tries one), or leave the library out.`);
  return libraries;
}

const urlOf = (id: string) => `${env.publicUrl}/b/${id}`;

export function registerTools(server: McpServer, user: User) {
  const uid = user.id;

  const run = <A>(fn: (args: A) => Promise<unknown>) => async (args: A) => {
    try {
      return text(await fn(args));
    } catch (error) {
      return failure(error);
    }
  };

  server.registerTool(
    "list_slots",
    {
      title: "List the slots",
      description:
        "The places a block can be shown in, and the room each one gives: its width, its height, whether the block may be clicked. A block is written for one slot; read this before writing one, since a block made for a page does not fit under the mouse.",
      inputSchema: z.object({}),
    },
    run(async () => ({ default: DEFAULT_SLOT, slots: SLOTS.map((slot) => ({ name: slot.name, room: slotText(slot), width: slot.width, height: slot.fill ? "fill" : slot.height, interactive: slot.interactive })) })),
  );

  server.registerTool(
    "list_libraries",
    {
      title: "List or try a library",
      description:
        "The libraries a block may ask for with <!-- block:use name@version -->. Without a name: the ones that were tried in a frame, each with what it is for, when to reach for it instead of plain html, and the line to write. ANY other package on npm may be named too. With a name: what was learned running that one in a frame (read it before using the library), or, for a package nobody tried, the package is brought now and the answer says whether it can be, the exact version, the global it arrives as and what that global holds. A name may carry a version and a file: three@0.186/addons/controls/OrbitControls.js. Plain html, css and svg are the default; a library is for when they are not enough.",
      inputSchema: z.object({ name: z.string().optional().describe("One library or npm package, as it would be written after block:use") }),
    },
    run(async ({ name }: { name?: string }) => {
      if (!name) return describe();
      const known = describe(name.replace(/@[^/@]*$/, ""));
      const tried = await bring(`<!-- block:use ${name.replace(/-->/g, "")} -->`);
      if (tried.problems.length) return { found: false, problem: tried.problems[0], note: "Check the name and the version on npm. Nothing is brought for a block that names this." };
      return { found: true, ...(known ?? { note: "Nobody tried this package in a frame. It was brought just now, so it can be named; whether it works without the network, storage and eval is for you to see." }), brought: tried.libraries };
    }),
  );

  server.registerTool(
    "list_blocks",
    {
      title: "List blocks",
      description: `The person's blocks, the last changed first: id, name, slot, whether it is shared, its size and the address it is seen at. Sources are left out; get_block returns one. ${WHAT_A_BLOCK_IS}`,
      inputSchema: z.object({}),
    },
    run(async () => ({ blocks: (await listBlocks(uid)).map((block) => ({ ...block, url: urlOf(block.id) })) })),
  );

  server.registerTool(
    "get_block",
    {
      title: "Get a block",
      description: "One block in full, with its html `source`. Read it before update_block, so the change is made against what is there.",
      inputSchema: z.object({ id: z.string().describe("The block's id, from list_blocks") }),
    },
    run(async ({ id }: { id: string }) => {
      const block = await getBlock(uid, id);
      if (!block) throw new Error(`no block ${id}: list_blocks has the ids`);
      return { ...block, url: urlOf(block.id) };
    }),
  );

  server.registerTool(
    "create_block",
    {
      title: "Create a block",
      description: `Makes a block and returns the address it is seen at. ${WHAT_A_BLOCK_IS} Before writing: list_slots when the place is not a page of its own, and list_libraries when plain html is not enough. The libraries the source names are brought before anything is saved: if one cannot be, nothing is saved and the answer says which. The answer lists the global each library arrives as; if the source calls it by another name, fix it with update_block. Give the person the url.\n\n${CONTRACT}`,
      inputSchema: z.object({
        name: z.string().min(1).max(120).describe("What the person will call it"),
        source: sourceSchema,
        slot: slotSchema.optional(),
        shared: z.boolean().optional().describe("true: anyone with the address sees it. Default false: only the person, signed in"),
      }),
    },
    run(async ({ name, source, slot, shared }: { name: string; source: string; slot?: string; shared?: boolean }) => {
      const libraries = await checked(source);
      const block = await createBlock(uid, { name, source, slot: slot ?? DEFAULT_SLOT, shared: shared ?? false });
      return { id: block.id, name: block.name, slot: block.slot, room: slotText(slotNamed(block.slot)!), shared: block.shared, url: urlOf(block.id), libraries };
    }),
  );

  server.registerTool(
    "update_block",
    {
      title: "Change a block",
      description: `Changes a block; what is left out stays as it was. A new \`source\` replaces the whole source (call get_block first and edit from what is there) and follows the same contract as in create_block; its libraries are brought before anything is saved. Changing \`slot\` changes the room the block has: a source written for one slot rarely fits another without changes. \`shared\` true gives its address to anyone who has it; false takes it back.\n\n${CONTRACT}`,
      inputSchema: z.object({
        id: z.string().describe("The block's id, from list_blocks"),
        name: z.string().min(1).max(120).optional(),
        source: sourceSchema.optional(),
        slot: slotSchema.optional(),
        shared: z.boolean().optional(),
      }),
    },
    run(async ({ id, ...changes }: { id: string; name?: string; source?: string; slot?: string; shared?: boolean }) => {
      const libraries = changes.source === undefined ? undefined : await checked(changes.source);
      const set = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
      if (!Object.keys(set).length) throw new Error("nothing to change: give a name, a source, a slot or shared");
      const block = await updateBlock(uid, id, set);
      if (!block) throw new Error(`no block ${id}: list_blocks has the ids`);
      return { id: block.id, name: block.name, slot: block.slot, room: slotText(slotNamed(block.slot)!), shared: block.shared, url: urlOf(block.id), ...(libraries ? { libraries } : {}) };
    }),
  );

  server.registerTool(
    "delete_block",
    {
      title: "Delete a block",
      description: "Removes a block for good; its address stops working, for the person and for anyone it was shared with. Ask the person first.",
      inputSchema: z.object({ id: z.string().describe("The block's id, from list_blocks") }),
    },
    run(async ({ id }: { id: string }) => {
      if (!(await deleteBlock(uid, id))) throw new Error(`no block ${id}: list_blocks has the ids`);
      return { deleted: id };
    }),
  );
}
