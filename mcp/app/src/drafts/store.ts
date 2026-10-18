/**
 * A person's live draft (table `drafts`, one row per person): written by the chat, by an agent on the MCP and
 * by the person in the code pane, and drawn again by the open page each time `version` goes up. The studio makes two
 * kinds of thing with it:
 *   - a LAYOUT: a preset UI that accepts data (its fields), drawn with made-up data; never shown on its own.
 *   - a BLOCK: finished content for the gallery, to share or embed. It may inherit a layout's look and fill in its
 *     own data; given a look of its own, it stops following the layout.
 * Publishing keeps it, only when asked, replacing the layout or the block it was started from, or making a new one.
 */
import { checkFields, checkRoom, placeholders, publishing, roomAdvice, roomSlot, sourceProblems, type Room, type Field } from "@ghostmind-dev/block";
import { gql } from "../db/hasura.ts";
import { ApiError } from "../errors.ts";
import { bring, DIRECTIVES } from "../blocks/check.ts";
import { DEFAULT_SLOT, SLOT_NAMES, slotNamed } from "../blocks/slots.ts";
import { createBlock, getBlock, updateBlock } from "../blocks/store.ts";
import { createLayout, findLayout, updateLayout } from "../layouts/store.ts";

export interface Draft {
  /** What is being made: a layout, or a block. */
  kind: "layout" | "block";
  source: string;
  name: string | null;
  /** The place it is written for, when it is one of the app's slots (blocks made before a layout had a room). */
  slot: string;
  /** Its room, set by the person: width and height. Null: the slot's. */
  room: Room | null;
  /** The data it shows: the fields `block.self()` answers, set by the person. */
  fields: Field[];
  /** The made-up data it is drawn with: what `block.self()` answers while it is written. */
  sample: unknown;
  version: number;
  updated_at: string | null;
  /** A layout draft: the layout it was started from, which a publish replaces. A block draft: the block. */
  based_on: { id: string; name: string } | null;
  /** A block draft: the layout whose look it inherits (its source is the layout's while it is), or null. */
  layout: { id: string; name: string; source: string } | null;
}

const FIELDS = "kind source name slot room fields sample version updated_at base { id name } block { id name } layout { id name source }";
const EMPTY: Draft = { kind: "layout", source: "", name: null, slot: DEFAULT_SLOT, room: null, fields: [], sample: null, version: 0, updated_at: null, based_on: null, layout: null };

type Row = Omit<Draft, "based_on"> & { base: { id: string; name: string } | null; block: { id: string; name: string } | null };
const draftOf = ({ base, block, ...row }: Row): Draft => ({ ...row, fields: row.fields ?? [], version: Number(row.version), based_on: row.kind === "block" ? block : base });

/** A layout's room: its own, or, for a block made for one of the app's places before rooms, that place's size. */
export function roomOf(layout: { room: Room | null; slot: string }): Room {
  if (layout.room) return layout.room;
  const slot = slotNamed(layout.slot);
  if (!slot) return { width: null, height: null };
  const side = (size: { min: number | null; max: number | null } | null) => (size ? { ...(size.min != null ? { min: size.min } : {}), ...(size.max != null ? { max: size.max } : {}) } : null);
  // a place that filled its window is given a window's height
  return { width: side(slot.width), height: slot.fill ? { min: 600, max: 600 } : side(slot.height) };
}

/** The room as a slot, so a layout is described and checked like a block in an app's place. */
export const slotOf = (layout: { room: Room | null; slot: string; name?: string | null }) => roomSlot(roomOf(layout), { what: layout.name ? `the place of the layout "${layout.name}"` : undefined });

/** What the frame would refuse in the draft's source: shown to the person, and it keeps a draft from being published. */
export const draftProblems = (draft: Draft) => (draft.source.trim() ? sourceProblems(draft.source, { names: DIRECTIVES }) : []);
/** How it could fit its room better: told to the model that writes it, never a refusal. */
export const draftAdvice = (draft: Draft) => (draft.source.trim() ? roomAdvice(draft.source, { slot: slotOf(draft) }) : []);

export async function readDraft(userId: string): Promise<Draft> {
  const data = await gql<{ drafts_by_pk: Row | null }>(`query($id: String!) { drafts_by_pk(user_id: $id) { ${FIELDS} } }`, { id: userId }, { userId });
  return data.drafts_by_pk ? draftOf(data.drafts_by_pk) : EMPTY;
}

/** Only the version: what an open page asks each second. */
export async function draftVersion(userId: string): Promise<number> {
  const data = await gql<{ drafts_by_pk: { version: number } | null }>(`query($id: String!) { drafts_by_pk(user_id: $id) { version } }`, { id: userId }, { userId });
  return Number(data.drafts_by_pk?.version ?? 0);
}

export interface DraftChanges {
  source?: string;
  name?: string | null;
  slot?: string;
  room?: Room | null;
  fields?: Field[];
  sample?: unknown;
  based_on?: string | null;
  kind?: "layout" | "block";
  layout_id?: string | null;
  block_id?: string | null;
}

const SAMPLE_MAX_BYTES = 50_000;

/** Writes what changed (the row is made on the first write) and answers with the draft and what is seen wrong in it. */
export async function writeDraft(userId: string, changes: DraftChanges): Promise<{ draft: Draft; problems: string[] }> {
  const set: Record<string, unknown> = {};
  if (changes.source !== undefined) {
    const source = String(changes.source).replace(/^\s*```[a-z]*\s*\n?/i, "").replace(/\n?```\s*$/, "");
    if (Buffer.byteLength(source) > 200_000) throw new ApiError(400, "the source is more than 200000 bytes");
    set.source = source;
  }
  if (changes.name !== undefined) set.name = changes.name === null ? null : String(changes.name).trim().slice(0, 120) || null;
  if (changes.slot !== undefined) {
    if (changes.slot !== "layout" && !SLOT_NAMES.includes(changes.slot)) throw new ApiError(400, `"${changes.slot}" is not a slot: ${SLOT_NAMES.join(", ")}`);
    set.slot = changes.slot;
  }
  try {
    if (changes.room !== undefined) set.room = changes.room === null ? null : checkRoom(changes.room);
    if (changes.fields !== undefined) set.fields = checkFields(changes.fields);
  } catch (error) {
    throw new ApiError(400, (error as Error).message);
  }
  // A layout is drawn with its fields' standard placeholders, never with data someone wrote: its sample follows its fields.
  const kind = changes.kind ?? (changes.fields !== undefined || changes.sample !== undefined ? (await readDraft(userId)).kind : undefined);
  if (kind === "layout") {
    delete changes.sample;
    if (changes.fields !== undefined || changes.kind !== undefined) set.sample = placeholders((set.fields as Field[] | undefined) ?? (await readDraft(userId)).fields);
  }
  if (changes.sample !== undefined) {
    const sample = changes.sample;
    if (sample !== null && (typeof sample !== "object" || Array.isArray(sample))) throw new ApiError(400, "the sample is an object, in the shape self() returns");
    if (Buffer.byteLength(JSON.stringify(sample)) > SAMPLE_MAX_BYTES) throw new ApiError(400, `the sample is more than ${SAMPLE_MAX_BYTES} bytes: keep a few realistic values`);
    set.sample = sample;
  }
  if (changes.based_on !== undefined) set.based_on = changes.based_on;
  if (changes.kind !== undefined) set.kind = changes.kind;
  if (changes.layout_id !== undefined) set.layout_id = changes.layout_id;
  if (changes.block_id !== undefined) set.block_id = changes.block_id;
  if (!Object.keys(set).length) throw new ApiError(400, "nothing to write: give a source, a name or a sample");
  const data = await gql<{ insert_drafts_one: Row }>(
    `mutation($row: drafts_insert_input!, $columns: [drafts_update_column!]!) {
      insert_drafts_one(object: $row, on_conflict: {constraint: drafts_pkey, update_columns: $columns}) { ${FIELDS} }
    }`,
    { row: set, columns: Object.keys(set) },
    { userId },
  );
  const draft = draftOf(data.insert_drafts_one);
  return { draft, problems: draftProblems(draft) };
}

/** Starts the draft from one of the person's layouts (by id or name): a publish then replaces that layout. */
export async function loadDraft(userId: string, which: string): Promise<Draft> {
  const layout = await findLayout(userId, which);
  if (!layout) throw new ApiError(404, "There is no layout of yours by that id or name: list_layouts has them.");
  return (await writeDraft(userId, { kind: "layout", source: layout.source, name: layout.name, slot: "layout", room: layout.room ?? null, fields: layout.fields, based_on: layout.id, layout_id: null, block_id: null })).draft;
}

/** Starts the draft from one of the person's blocks: a publish then replaces that block. */
export async function loadBlockDraft(userId: string, id: string): Promise<Draft> {
  const block = await getBlock(userId, id);
  if (!block) throw new ApiError(404, "There is no block of yours with that id: list_blocks has them.");
  return (await writeDraft(userId, { kind: "block", source: block.source, name: block.name, slot: block.slot, room: roomOf(block), fields: block.fields, sample: block.sample ?? null, based_on: null, layout_id: block.layout?.id ?? null, block_id: block.id })).draft;
}

/** A new, empty layout: its room and the data it shows, set by the person. */
export async function newDraft(userId: string, { room, fields = [], name }: { room: Room; fields?: Field[]; name?: string | null }): Promise<Draft> {
  return (await writeDraft(userId, { kind: "layout", source: "", name: name ?? null, slot: "layout", room, fields, based_on: null, layout_id: null, block_id: null })).draft;
}

/** A new block: empty, in the room given, or from a layout (its look, its room, its fields, its made-up data to start). */
export async function newBlockDraft(userId: string, { layout: which, room, name }: { layout?: string | null; room?: Room; name?: string | null }): Promise<Draft> {
  if (which) {
    const layout = await findLayout(userId, which);
    if (!layout) throw new ApiError(404, "There is no layout of yours by that id or name: list_layouts has them.");
    // the block starts from the layout's placeholders; its own data replaces them
    return (await writeDraft(userId, { kind: "block", source: layout.source, name: name ?? null, slot: "layout", room: layout.room ?? null, fields: layout.fields, sample: placeholders(layout.fields), based_on: null, layout_id: layout.id, block_id: null })).draft;
  }
  return (await writeDraft(userId, { kind: "block", source: "", name: name ?? null, slot: "layout", room: room ?? { width: null, height: null }, fields: [], sample: null, based_on: null, layout_id: null, block_id: null })).draft;
}

/** What a publish will do, in a sentence. */
export const publishPlan = (draft: Draft, args: { name?: string; as_new?: boolean } = {}) => {
  const said = publishing(draft, args);
  return draft.kind === "block" ? said.replace(/layout|block/g, "block").replace("Keep this draft as a new block", "Keep this as a new block in the gallery") : said.replace(/block/g, "layout");
};

/** Keeps the draft: a layout as a layout, a block as a block (in the gallery). Replaces the one it came from, or makes a new one. */
export async function publishDraft(userId: string, { name, as_new }: { name?: string; as_new?: boolean } = {}): Promise<{ kind: "layout" | "block"; id: string; name: string }> {
  const draft = await readDraft(userId);
  if (!draft.source.trim()) throw new ApiError(400, "The draft is empty: there is nothing to publish.");
  const problems = draftProblems(draft);
  if (problems.length) throw new ApiError(400, `Not published: ${problems.join("; ")}`);
  const brought = await bring(draft.source);
  if (brought.problems.length) throw new ApiError(400, `Not published: a library it names could not be brought (${brought.problems.join("; ")})`);
  const called = (name || draft.name || "Untitled").slice(0, 120);

  if (draft.kind === "block") {
    // a block keeps following its layout while it has the layout's look; given its own, it is its own html
    const follows = draft.layout && draft.layout.source === draft.source ? draft.layout.id : null;
    const kept = { name: called, source: draft.source, slot: draft.slot, room: draft.room, sample: draft.sample, layout_id: follows };
    if (draft.based_on && !as_new) {
      const block = await updateBlock(userId, draft.based_on.id, kept);
      if (block) return { kind: "block", id: block.id, name: block.name };
    }
    const block = await createBlock(userId, { ...kept, layout_id: follows ?? undefined, shared: false });
    await writeDraft(userId, { block_id: block.id, name: called });
    return { kind: "block", id: block.id, name: block.name };
  }

  const kept = { name: called, source: draft.source, room: draft.room, fields: draft.fields, sample: placeholders(draft.fields) };
  if (draft.based_on && !as_new) {
    const layout = await updateLayout(userId, draft.based_on.id, kept);
    if (layout) return { kind: "layout", id: layout.id, name: layout.name };
  }
  const layout = await createLayout(userId, kept);
  await writeDraft(userId, { based_on: layout.id, name: called });
  return { kind: "layout", id: layout.id, name: layout.name };
}
