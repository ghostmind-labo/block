import { FIELD_TYPES, fieldsText, shapeOf, slotText } from "@ghostmind-dev/block";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { User } from "../auth/google.ts";
import { bring, lookUpLibrary, sourceProblem } from "../blocks/check.ts";
import { CONTRACT } from "../blocks/contract.ts";
import { DEFAULT_SLOT, SLOT_NAMES, SLOTS, slotNamed } from "../blocks/slots.ts";
import { createBlock, deleteBlock, getBlock, listBlocks, updateBlock } from "../blocks/store.ts";
import { checkData, createFromLayout, deleteLayout, findLayout, listLayouts } from "../layouts/store.ts";
import { draftAdvice, loadBlockDraft, loadDraft, newBlockDraft, newDraft, publishDraft, publishPlan, readDraft, slotOf, writeDraft } from "../drafts/store.ts";
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
      if (changes.source !== undefined) {
        const current = await getBlock(uid, id);
        if (current?.layout) throw new Error(`"${current.name}" is drawn with the layout "${current.layout.name}": change that layout (load_draft ${current.layout.id}, then publish_draft), and every block made from it follows. set_block_data changes this block's own data`);
      }
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

  // The live draft: the same one the layout chat writes, drawn again on the person's open page at each write.
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
      // what the layout asks of the app it is applied to, read from its sample: none of it required
      return { ...draft, room: slotText(slotOf(draft)!), fields: fieldsText(draft.fields), asks: shapeOf(draft.sample), url: `${env.publicUrl}/make` };
    }),
  );

  server.registerTool(
    "new_draft",
    {
      title: "Start a new layout or block",
      description: `Starts a new live draft. kind "layout" (the default): a preset UI that accepts data, never shown on its own, with the room the person gives it and the data it shows. kind "block": finished content for the gallery (to share or embed), empty in the room given, or from a layout (its look, room and fields; you then write its data). The room: a width (exact or at most, in px; none: as wide as its place) and a height (exact or at most; none: as tall as its content). The data: the fields \`block.self()\` answers (in an app, each one is one of the app's own values, like potion.self().name). Ask the person for both when they did not say. What the draft held is lost: ask first when it was not published. ${LIVE}`,
      inputSchema: z.object({
        name: z.string().min(1).max(120).optional(),
        width: z.number().int().optional().describe("Exactly this many px wide"),
        max_width: z.number().int().optional().describe("At most this many px wide"),
        height: z.number().int().optional().describe("Exactly this many px tall"),
        max_height: z.number().int().optional().describe("At most this many px tall; with neither, as tall as its content"),
        fields: z.array(z.object({ key: z.string(), type: z.enum(FIELD_TYPES as [string, ...string[]]) })).optional().describe("A layout: the data it shows, name and kind of each value self() answers"),
        kind: z.enum(["layout", "block"]).optional(),
        layout: z.string().optional().describe("A block made from a layout: its id or name, from list_layouts"),
      }),
    },
    run(async ({ name, width, max_width, height, max_height, fields, kind, layout }: { name?: string; width?: number; max_width?: number; height?: number; max_height?: number; fields?: { key: string; type: string }[]; kind?: "layout" | "block"; layout?: string }) => {
      const room = {
        width: width ? { min: width, max: width } : max_width ? { max: max_width } : null,
        height: height ? { min: height, max: height } : max_height ? { max: max_height } : null,
      };
      const draft = kind === "block" ? await newBlockDraft(uid, { layout: layout ?? null, room, name }) : await newDraft(uid, { room, fields, name });
      return { started: true, kind: draft.kind, layout: draft.layout?.name, room: slotText(slotOf(draft)!), fields: fieldsText(draft.fields), url: `${env.publicUrl}/make` };
    }),
  );

  server.registerTool(
    "write_draft",
    {
      title: "Write the live draft",
      description: `Writes the person's live draft: the whole source (it replaces what is there), its name, and, for a block, its sample (its own data, what \`await block.self()\` answers in it: real and specific; a layout has none, it is drawn with its fields' standard placeholders). ${LIVE} Its room and its fields may be written too, when the person asks; the sample keeps exactly the fields. Write a first version early, then step by step. The answer lists what is seen wrong in the source; fix it in the next write. Nothing is kept as a block until publish_draft.\n\n${CONTRACT}`,
      inputSchema: z.object({
        source: sourceSchema.optional(),
        name: z.string().min(1).max(120).optional(),
        sample: z.record(z.string(), z.unknown()).optional().describe("A block's own data, the object block.self() answers (a layout's is its placeholders)"),
        room: z.object({ width: Side, height: Side }).optional().describe("Width and height in px: {min,max} equal = exactly, {max} = at most, null = full width / its content"),
        fields: z.array(z.object({ key: z.string(), type: z.enum(FIELD_TYPES as [string, ...string[]]) })).optional().describe("All the fields self() answers (replaces the list)"),
      }),
    },
    run(async (changes: { source?: string; name?: string; sample?: Record<string, unknown>; room?: { width: { min?: number; max?: number } | null; height: { min?: number; max?: number } | null }; fields?: { key: string; type: string }[] }) => {
      const { draft, problems } = await writeDraft(uid, changes);
      const advice = draftAdvice(draft);
      return { written: true, version: draft.version, name: draft.name, room: slotText(slotOf(draft)), fields: fieldsText(draft.fields), url: `${env.publicUrl}/make`, ...(problems.length ? { problems } : {}), ...(advice.length ? { advice } : {}) };
    }),
  );

  server.registerTool(
    "load_draft",
    {
      title: "Open a layout or a block in the draft",
      description: `Starts the live draft from one of the person's layouts (layout) or blocks (block): it replaces the draft's content, and a publish then replaces that layout or block. What the draft held is lost: ask the person first when it was not published. ${LIVE}`,
      inputSchema: z.object({ layout: z.string().optional().describe("A layout's id or name, from list_layouts"), block: z.string().optional().describe("A block's id, from list_blocks"), id: z.string().optional().describe("Same as layout (older callers)") }),
    },
    run(async ({ layout, block, id }: { layout?: string; block?: string; id?: string }) => {
      if (block) return { loaded: true, ...(await loadBlockDraft(uid, block)), url: `${env.publicUrl}/make` };
      if (!layout && !id) throw new Error("give a layout (id or name) or a block (id)");
      return { loaded: true, ...(await loadDraft(uid, (layout ?? id)!)), url: `${env.publicUrl}/make` };
    }),
  );

  server.registerTool(
    "publish_draft",
    {
      title: "Publish the live draft",
      description: "Keeps the live draft: a layout as a layout, a block as a block in the gallery. It replaces the one the draft was started from (unless as_new), or makes a new one. Only when the person asks. Without confirm: true it publishes nothing and answers what it would do, to tell the person first.",
      inputSchema: z.object({
        name: z.string().min(1).max(120).optional().describe("The block's name, when it is not the draft's"),
        as_new: z.boolean().optional().describe("A new block even when the draft was started from one"),
        confirm: z.boolean().optional().describe("true once the person agreed to what the answer without it said"),
      }),
    },
    run(async ({ confirm, ...args }: { name?: string; as_new?: boolean; confirm?: boolean }) => {
      if (!confirm) return { published: false, would: publishPlan(await readDraft(uid), args), note: "Tell the person, then call again with confirm: true." };
      const kept = await publishDraft(uid, args);
      return { published: true, ...kept, ...(kept.kind === "block" ? { url: urlOf(kept.id) } : {}) };
    }),
  );

  // Layouts, as in Potion: a layout is a preset UI that accepts data, not a block. A block is made with html of its
  // own (create_block, the usual way here) or, now and then, from a layout and its data (create_block_from_layout).
  const fieldsOf = (fields: { key: string; type: string }[] | null) => (fields?.length ? fieldsText(fields) : "none");

  server.registerTool(
    "list_layouts",
    {
      title: "List the layouts",
      description: "The person's layouts: preset UIs that accept data. Each with its id, name and fields (the data block.self() answers). A layout is not a block; a block may be made from one (create_block_from_layout).",
      inputSchema: z.object({}),
    },
    run(async () => ({
      layouts: (await listLayouts(uid)).map((layout) => ({ id: layout.id, name: layout.name, fields: fieldsOf(layout.fields) })),
    })),
  );

  server.registerTool(
    "get_layout",
    {
      title: "Get a layout",
      description: "One layout in full: its source, room, fields and sample data. A layout is a preset UI that accepts data, not a block: to change it, load_draft it.",
      inputSchema: z.object({ layout: z.string().describe("Its id or name, from list_layouts") }),
    },
    run(async ({ layout }: { layout: string }) => {
      const found = await findLayout(uid, layout);
      if (!found) throw new Error(`no layout "${layout}": list_layouts has them`);
      return { ...found, fields: fieldsOf(found.fields) };
    }),
  );

  server.registerTool(
    "delete_layout",
    {
      title: "Delete a layout",
      description: "Removes a layout for good. The blocks made from it keep the copy of its source they were made with. Ask the person first.",
      inputSchema: z.object({ id: z.string().describe("The layout's id, from list_layouts") }),
    },
    run(async ({ id }: { id: string }) => {
      if (!(await deleteLayout(uid, id))) throw new Error(`no layout ${id}: list_layouts has the ids`);
      return { deleted: id };
    }),
  );

  server.registerTool(
    "create_block_from_layout",
    {
      title: "Make a block from a layout",
      description:
        "Makes a new block from one of the person's layouts and its own data, when the person asks for one (\"a new pizza place from the place layout\"); otherwise a block is made with create_block. The data is an object with the layout's fields (list_layouts), filled with real or realistic values; any field may be left out, and one the layout does not read is refused. The block is drawn with the layout's source as it is now. Give the person the url.",
      inputSchema: z.object({
        layout: z.string().describe("The layout's id or name, from list_layouts"),
        name: z.string().min(1).max(120).describe("The new block's name, e.g. the place's"),
        data: z.record(z.string(), z.unknown()).describe("The layout's fields, filled: what block.self() answers in this block"),
        shared: z.boolean().optional().describe("true: anyone with its address sees it, and it can be embedded"),
      }),
    },
    run(async ({ layout, name, data, shared }: { layout: string; name: string; data: Record<string, unknown>; shared?: boolean }) => {
      const block = await createFromLayout(uid, { layout, name, data, shared });
      return { id: block.id, name: block.name, layout: block.layout?.name, shared: block.shared, url: urlOf(block.id) };
    }),
  );

  server.registerTool(
    "set_block_data",
    {
      title: "Change a block's data",
      description: "Replaces the data of a block made from a layout (what block.self() answers in it): an object with the layout's fields. Read the block first (get_block, its sample) to change only some of it.",
      inputSchema: z.object({ id: z.string().describe("The block's id"), data: z.record(z.string(), z.unknown()) }),
    },
    run(async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const block = await getBlock(uid, id);
      if (!block) throw new Error(`no block ${id}: list_blocks has the ids`);
      if (!block.layout) throw new Error(`"${block.name}" was not made from a layout: its data is its sample, written with its source (update_block)`);
      checkData(block, data);
      const changed = await updateBlock(uid, id, { sample: data });
      return { id, name: changed?.name, data, url: urlOf(id) };
    }),
  );
}
