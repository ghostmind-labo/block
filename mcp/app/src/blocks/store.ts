import { gql } from "../db/hasura.ts";

export interface Block {
  id: string;
  name: string;
  slot: string;
  shared: boolean;
  source: string;
  /** Its data: what `block.self()` answers in it (for a block made from a layout, the layout's fields filled). */
  sample: unknown;
  /** The room it is drawn in: its layout's, or its own (null for a block made for one of the app's slots). */
  room: { width: { min?: number; max?: number } | null; height: { min?: number; max?: number } | null } | null;
  /** The fields its data has: its layout's; empty for a block with html of its own. */
  fields: { key: string; type: string }[];
  /** The layout it was made from, whose source and room it is drawn with; null for a block with html of its own. */
  layout_id: string | null;
  layout: { id: string; name: string } | null;
  created_at: string;
  updated_at: string;
}
export type BlockSummary = Omit<Block, "source"> & { bytes: number };

type Row = Omit<Block, "layout" | "fields"> & { layout: { id: string; name: string; source: string; room: Block["room"]; fields: Block["fields"] | null } | null };
const FIELDS = "id name slot shared source sample room layout_id layout { id name source room fields } created_at updated_at";

/** A block as it is drawn: one made from a layout takes the layout's source, room and fields as they are now. */
const drawn = ({ layout, ...row }: Row): Block =>
  layout ? { ...row, source: layout.source, room: layout.room, fields: layout.fields ?? [], layout: { id: layout.id, name: layout.name } } : { ...row, fields: [], layout: null };
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
    `query($id: uuid!) { blocks(where: {id: {_eq: $id}, shared: {_eq: true}}) { id name slot source sample room layout { id name source room fields } updated_at } }`,
    { id },
    "admin",
  );
  // drawn with its layout even when the layout itself is not shared: the block is, and the layout is what it looks like
  const row = data.blocks[0];
  if (!row) return null;
  const { layout_id: _layout, created_at: _created, shared: _shared, ...block } = drawn({ ...row, layout_id: null, created_at: "", shared: true });
  return block;
}

export async function createBlock(userId: string, block: { name: string; source: string; slot: string; shared: boolean; sample?: unknown; room?: Block["room"]; layout_id?: string }): Promise<Block> {
  const data = await gql<{ insert_blocks_one: Row }>(`mutation($block: blocks_insert_input!) { insert_blocks_one(object: $block) { ${FIELDS} } }`, { block }, { userId });
  return drawn(data.insert_blocks_one);
}

export async function updateBlock(userId: string, id: string, changes: Partial<Pick<Block, "name" | "source" | "slot" | "shared" | "sample" | "room" | "layout_id">>): Promise<Block | null> {
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
