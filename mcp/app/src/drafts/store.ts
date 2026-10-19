/**
 * A person's live draft (table `drafts`, one row per person): the block being written, by the chat, by an agent on
 * the MCP and by the person in the code pane, and drawn again by the open page each time `version` goes up. Saving
 * keeps it, only when asked: it replaces the block it was started from (`block_id`), or makes a new one.
 */
import { checkRoom, saving, roomAdvice, roomSlot, sourceProblems, type Room } from "@ghostmind-dev/block";
import { gql } from "../db/hasura.ts";
import { ApiError } from "../errors.ts";
import { bring, DIRECTIVES } from "../blocks/check.ts";
import { DEFAULT_SLOT, SLOT_NAMES, slotNamed } from "../blocks/slots.ts";
import { createBlock, getBlock, updateBlock } from "../blocks/store.ts";

export interface Draft {
  source: string;
  name: string | null;
  /** The place it is written for, when it is one of the app's slots (blocks made before a block had a room). */
  slot: string;
  /** Its room: width and height. Null: the slot's. */
  room: Room | null;
  /** What `block.self()` answers in it, for a block that keeps its data apart from its html. Usually none. */
  sample: unknown;
  version: number;
  updated_at: string | null;
  /** The block it was started from, which a save replaces. */
  based_on: { id: string; name: string } | null;
}

const FIELDS = "source name slot room sample version updated_at block { id name }";
const EMPTY: Draft = { source: "", name: null, slot: DEFAULT_SLOT, room: null, sample: null, version: 0, updated_at: null, based_on: null };

type Row = Omit<Draft, "based_on"> & { block: { id: string; name: string } | null };
const draftOf = ({ block, ...row }: Row): Draft => ({ ...row, version: Number(row.version), based_on: block });

/** A block's room: its own, or, for a block made for one of the app's places before rooms, that place's size. */
export function roomOf(block: { room: Room | null; slot: string }): Room {
  if (block.room) return block.room;
  const slot = slotNamed(block.slot);
  if (!slot) return { width: null, height: null };
  const side = (size: { min: number | null; max: number | null } | null) => (size ? { ...(size.min != null ? { min: size.min } : {}), ...(size.max != null ? { max: size.max } : {}) } : null);
  // a place that filled its window is given a window's height
  return { width: side(slot.width), height: slot.fill ? { min: 600, max: 600 } : side(slot.height) };
}

/** The room as a slot, so the draft is described and checked like a block in an app's place. */
export const slotOf = (block: { room: Room | null; slot: string; name?: string | null }) => roomSlot(roomOf(block), { what: block.name ? `the place of the block "${block.name}"` : undefined });

/** What the frame would refuse in the draft's source: shown to the person, and it keeps a draft from being saved. */
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
  sample?: unknown;
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
  } catch (error) {
    throw new ApiError(400, (error as Error).message);
  }
  if (changes.sample !== undefined) {
    const sample = changes.sample;
    if (sample !== null && (typeof sample !== "object" || Array.isArray(sample))) throw new ApiError(400, "the sample is an object, in the shape self() returns");
    if (Buffer.byteLength(JSON.stringify(sample)) > SAMPLE_MAX_BYTES) throw new ApiError(400, `the sample is more than ${SAMPLE_MAX_BYTES} bytes`);
    set.sample = sample;
  }
  if (changes.block_id !== undefined) set.block_id = changes.block_id;
  if (!Object.keys(set).length) throw new ApiError(400, "nothing to write: give a source, a name or a room");
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

/** Starts the draft from one of the person's blocks: a save then replaces that block. */
export async function loadDraft(userId: string, id: string): Promise<Draft> {
  const block = await getBlock(userId, id);
  if (!block) throw new ApiError(404, "There is no block of yours with that id: list_blocks has them.");
  return (await writeDraft(userId, { source: block.source, name: block.name, slot: block.slot, room: roomOf(block), sample: block.sample ?? null, block_id: block.id })).draft;
}

/** A new, empty block, in the room given (none: as wide as its place, as tall as its content). */
export async function newDraft(userId: string, { room, name }: { room?: Room; name?: string | null } = {}): Promise<Draft> {
  return (await writeDraft(userId, { source: "", name: name ?? null, slot: "layout", room: room ?? { width: null, height: null }, sample: null, block_id: null })).draft;
}

/** What a save will do, in a sentence. */
export const savePlan = (draft: Draft, args: { name?: string; as_new?: boolean } = {}) => saving({ ...draft, kind: "block" }, args);

/** Keeps the draft as a block: the one it was started from, replaced, or a new one (private until it is shared). */
export async function saveDraft(userId: string, { name, as_new }: { name?: string; as_new?: boolean } = {}): Promise<{ id: string; name: string }> {
  const draft = await readDraft(userId);
  if (!draft.source.trim()) throw new ApiError(400, "The draft is empty: there is nothing to save.");
  const problems = draftProblems(draft);
  if (problems.length) throw new ApiError(400, `Not saved: ${problems.join("; ")}`);
  const brought = await bring(draft.source);
  if (brought.problems.length) throw new ApiError(400, `Not saved: a library it names could not be brought (${brought.problems.join("; ")})`);
  const called = (name || draft.name || "Untitled").slice(0, 120);
  const kept = { name: called, source: draft.source, slot: draft.slot, room: draft.room, sample: draft.sample };
  if (draft.based_on && !as_new) {
    const block = await updateBlock(userId, draft.based_on.id, kept);
    if (block) return { id: block.id, name: block.name };
  }
  const block = await createBlock(userId, { ...kept, shared: false });
  await writeDraft(userId, { block_id: block.id, name: called });
  return { id: block.id, name: block.name };
}
