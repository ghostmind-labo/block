import { slotText } from "@ghostmind-dev/block";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { User } from "../auth/google.ts";
import { bring, lookUpLibrary, sourceProblem } from "../blocks/check.ts";
import { CONTRACT } from "../blocks/contract.ts";
import { DEFAULT_SLOT, SLOT_NAMES, SLOTS, slotNamed } from "../blocks/slots.ts";
import { createBlock, deleteBlock, getBlock, listBlocks, updateBlock } from "../blocks/store.ts";
import { draftAdvice, loadDraft, newDraft, readDraft, saveDraft, savePlan, slotOf, writeDraft } from "../drafts/store.ts";
import { env } from "../env.ts";

const Side = z.object({ min: z.number().int().optional(), max: z.number().int().optional() }).nullable();
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
    run(async ({ name }: { name?: string }) => lookUpLibrary(name)),
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

  // The live draft: the same one the block chat writes, drawn again on the person's open page at each write.
  const LIVE = `The person watches it at ${env.publicUrl}/make, where it is drawn again each time it is written.`;

  server.registerTool(
    "read_draft",
    {
      title: "Read the live draft",
      description: `The person's live draft: the block being written, its source, name and slot, and the block it was started from. ${LIVE} Read it before changing it: the person or the chat may have changed it.`,
      inputSchema: z.object({}),
    },
    run(async () => {
      const draft = await readDraft(uid);
      return { ...draft, room: slotText(slotOf(draft)!), url: `${env.publicUrl}/make` };
    }),
  );

  server.registerTool(
    "new_draft",
    {
      title: "Start a new block",
      description: `Starts a new, empty live draft: a block, in the room the person gives it: a width (exact or at most, in px; none: as wide as its place) and a height (exact or at most; none: as tall as its content). What the draft held is lost: ask first when it was not saved. ${LIVE}`,
      inputSchema: z.object({
        name: z.string().min(1).max(120).optional(),
        width: z.number().int().optional().describe("Exactly this many px wide"),
        max_width: z.number().int().optional().describe("At most this many px wide"),
        height: z.number().int().optional().describe("Exactly this many px tall"),
        max_height: z.number().int().optional().describe("At most this many px tall; with neither, as tall as its content"),
      }),
    },
    run(async ({ name, width, max_width, height, max_height }: { name?: string; width?: number; max_width?: number; height?: number; max_height?: number }) => {
      const room = {
        width: width ? { min: width, max: width } : max_width ? { max: max_width } : null,
        height: height ? { min: height, max: height } : max_height ? { max: max_height } : null,
      };
      const draft = await newDraft(uid, { room, name });
      return { started: true, room: slotText(slotOf(draft)!), url: `${env.publicUrl}/make` };
    }),
  );

  server.registerTool(
    "write_draft",
    {
      title: "Write the live draft",
      description: `Writes the person's live draft: the whole source (it replaces what is there), its name, its room. ${LIVE} Write a first version early, then step by step. The answer lists what is seen wrong in the source; fix it in the next write. Nothing is kept until save_draft.\n\n${CONTRACT}`,
      inputSchema: z.object({
        source: sourceSchema.optional(),
        name: z.string().min(1).max(120).optional(),
        room: z.object({ width: Side, height: Side }).optional().describe("Width and height in px: {min,max} equal = exactly, {max} = at most, null = full width / its content"),
      }),
    },
    run(async (changes: { source?: string; name?: string; room?: { width: { min?: number; max?: number } | null; height: { min?: number; max?: number } | null } }) => {
      const { draft, problems } = await writeDraft(uid, changes);
      const advice = draftAdvice(draft);
      return { written: true, version: draft.version, name: draft.name, room: slotText(slotOf(draft)), url: `${env.publicUrl}/make`, ...(problems.length ? { problems } : {}), ...(advice.length ? { advice } : {}) };
    }),
  );

  server.registerTool(
    "load_draft",
    {
      title: "Open a block in the draft",
      description: `Starts the live draft from one of the person's blocks: it replaces the draft's content, and a save then replaces that block. What the draft held is lost: ask the person first when it was not saved. ${LIVE}`,
      inputSchema: z.object({ id: z.string().describe("The block's id, from list_blocks") }),
    },
    run(async ({ id }: { id: string }) => ({ loaded: true, ...(await loadDraft(uid, id)), url: `${env.publicUrl}/make` })),
  );

  server.registerTool(
    "save_draft",
    {
      title: "Save the live draft",
      description: "Saves the live draft as a block, private until it is shared (update_block shared). It replaces the block the draft was started from (unless as_new), or makes a new one. Only when the person asks. Without confirm: true it saves nothing and answers what it would do, to tell the person first.",
      inputSchema: z.object({
        name: z.string().min(1).max(120).optional().describe("Its name, when it is not the draft's"),
        as_new: z.boolean().optional().describe("A new block even when the draft was started from one"),
        confirm: z.boolean().optional().describe("true once the person agreed to what the answer without it said"),
      }),
    },
    run(async ({ confirm, ...args }: { name?: string; as_new?: boolean; confirm?: boolean }) => {
      if (!confirm) return { saved: false, would: savePlan(await readDraft(uid), args), note: "Tell the person, then call again with confirm: true." };
      const kept = await saveDraft(uid, args);
      return { saved: true, ...kept, url: urlOf(kept.id) };
    }),
  );
}
