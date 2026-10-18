import { gql } from "../db/hasura.ts";

export interface Block {
  id: string;
  name: string;
  slot: string;
  shared: boolean;
  source: string;
  /** The made-up data it was written with: what `block.self()` answers in this app. */
  sample: unknown;
  /** Its room and the data it shows, set by the person (null and [] for a block made for one of the app's slots). */
  room: { width: { min?: number; max?: number } | null; height: { min?: number; max?: number } | null } | null;
  fields: { key: string; type: string }[] | null;
  /** The layout it was made from, whose source, room and fields it is drawn with; null for a layout or a block of its own. */
  layout_id: string | null;
  layout: { id: string; name: string } | null;
  created_at: string;
  updated_at: string;
}
export type BlockSummary = Omit<Block, "source"> & { bytes: number };

type Row = Omit<Block, "layout"> & { layout: { id: string; name: string; source: string; room: Block["room"]; fields: Block["fields"] } | null };
const FIELDS = "id name slot shared source sample room fields layout_id layout { id name source room fields } created_at updated_at";

/** A block as it is drawn: one made from a layout takes the layout's source, room and fields as they are now. */
const drawn = ({ layout, ...row }: Row): Block =>
  layout ? { ...row, source: layout.source, room: layout.room, fields: layout.fields, layout: { id: layout.id, name: layout.name } } : { ...row, layout: null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A person's row, made the first time they sign in. */
export async function ensureUser(profile: { id: string; email: string; name?: string; picture?: string }): Promise<void> {
  await gql(
    `mutation($user: users_insert_input!) {
      insert_users_one(object: $user, on_conflict: {constraint: users_pkey, update_columns: [email, name, picture]}) { id }
    }`,
    { user: { id: profile.id, email: profile.email, name: profile.name ?? null, picture: profile.picture ?? null } },
    "admin",
  );
}

const summary = ({ source, ...block }: Block): BlockSummary => ({ ...block, bytes: Buffer.byteLength(source) });

export async function listBlocks(userId: string): Promise<BlockSummary[]> {
  const data = await gql<{ blocks: Row[] }>(`query { blocks(order_by: {updated_at: desc}) { ${FIELDS} } }`, {}, { userId });
  return data.blocks.map(drawn).map(summary);
}

/** One of the person's blocks. */
export async function getBlock(userId: string, id: string): Promise<Block | null> {
  if (!UUID.test(id)) return null;
  const data = await gql<{ blocks_by_pk: Row | null }>(`query($id: uuid!) { blocks_by_pk(id: $id) { ${FIELDS} } }`, { id }, { userId });
  return data.blocks_by_pk ? drawn(data.blocks_by_pk) : null;
}

/** A block anyone may see: one its owner shared. Read as the server, so the check is written here. */
export async function getSharedBlock(id: string): Promise<Pick<Block, "id" | "name" | "slot" | "source" | "sample" | "room" | "fields" | "updated_at"> | null> {
  if (!UUID.test(id)) return null;
  const data = await gql<{ blocks: Row[] }>(
    `query($id: uuid!) { blocks(where: {id: {_eq: $id}, shared: {_eq: true}}) { id name slot source sample room fields layout { id name source room fields } updated_at } }`,
    { id },
    "admin",
  );
  // drawn with its layout even when the layout itself is not shared: the block is, and the layout is what it looks like
  const row = data.blocks[0];
  if (!row) return null;
  const { layout_id: _layout, created_at: _created, shared: _shared, ...block } = drawn({ ...row, layout_id: null, created_at: "", shared: true });
  return block;
}

export async function createBlock(userId: string, block: { name: string; source: string; slot: string; shared: boolean; sample?: unknown; room?: Block["room"]; fields?: Block["fields"]; layout_id?: string }): Promise<Block> {
  const data = await gql<{ insert_blocks_one: Row }>(`mutation($block: blocks_insert_input!) { insert_blocks_one(object: $block) { ${FIELDS} } }`, { block }, { userId });
  return drawn(data.insert_blocks_one);
}

/** The person's layouts: the blocks with data fields that were not made from another layout, the templates of new blocks. */
export async function listLayouts(userId: string): Promise<BlockSummary[]> {
  return (await listBlocks(userId)).filter((block) => !block.layout_id && (block.fields?.length ?? 0) > 0);
}

/**
 * A new block from a layout and its own data: the layout's fields, filled. A key the layout does not read is
 * refused, with the fields it has; none is required. It is drawn with the layout's source as it is now.
 */
export async function createFromLayout(userId: string, { layout: which, name, data, shared = false }: { layout: string; name: string; data: Record<string, unknown>; shared?: boolean }): Promise<Block> {
  const layouts = await listLayouts(userId);
  const named = layouts.find((each) => each.id === which) ?? layouts.find((each) => each.name.toLowerCase() === which.trim().toLowerCase());
  const layout = named ? await getBlock(userId, named.id) : null;
  if (!layout) throw new Error(`no layout "${which}": list_layouts has their ids, names and fields`);
  checkData(layout, data);
  return createBlock(userId, { name, source: layout.source, slot: layout.slot, shared, sample: data, room: layout.room, fields: layout.fields, layout_id: layout.id });
}

/** The data of a block made from a layout: only the layout's fields. */
export function checkData(layout: Pick<Block, "name" | "fields">, data: Record<string, unknown>) {
  const keys = new Set((layout.fields ?? []).map((field) => field.key));
  const unknown = Object.keys(data).filter((key) => !keys.has(key));
  if (unknown.length) throw new Error(`the layout "${layout.name}" does not read ${unknown.join(", ")}: its fields are ${[...keys].join(", ") || "none"}`);
}

export async function updateBlock(userId: string, id: string, changes: Partial<Pick<Block, "name" | "source" | "slot" | "shared" | "sample" | "room" | "fields">>): Promise<Block | null> {
  if (!UUID.test(id)) return null;
  const data = await gql<{ update_blocks_by_pk: Row | null }>(
    `mutation($id: uuid!, $changes: blocks_set_input!) { update_blocks_by_pk(pk_columns: {id: $id}, _set: $changes) { ${FIELDS} } }`,
    { id, changes },
    { userId },
  );
  return data.update_blocks_by_pk ? drawn(data.update_blocks_by_pk) : null;
}

export async function deleteBlock(userId: string, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const data = await gql<{ delete_blocks_by_pk: { id: string } | null }>(`mutation($id: uuid!) { delete_blocks_by_pk(id: $id) { id } }`, { id }, { userId });
  return data.delete_blocks_by_pk !== null;
}
