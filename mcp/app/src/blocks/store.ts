import { gql } from "../db/hasura.ts";

export interface Block {
  id: string;
  name: string;
  slot: string;
  shared: boolean;
  source: string;
  created_at: string;
  updated_at: string;
}
export type BlockSummary = Omit<Block, "source"> & { bytes: number };

const FIELDS = "id name slot shared source created_at updated_at";
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
  const data = await gql<{ blocks: Block[] }>(`query { blocks(order_by: {updated_at: desc}) { ${FIELDS} } }`, {}, { userId });
  return data.blocks.map(summary);
}

/** One of the person's blocks. */
export async function getBlock(userId: string, id: string): Promise<Block | null> {
  if (!UUID.test(id)) return null;
  const data = await gql<{ blocks_by_pk: Block | null }>(`query($id: uuid!) { blocks_by_pk(id: $id) { ${FIELDS} } }`, { id }, { userId });
  return data.blocks_by_pk;
}

/** A block anyone may see: one its owner shared. Read as the server, so the check is written here. */
export async function getSharedBlock(id: string): Promise<Pick<Block, "id" | "name" | "slot" | "source" | "updated_at"> | null> {
  if (!UUID.test(id)) return null;
  const data = await gql<{ blocks: Block[] }>(
    `query($id: uuid!) { blocks(where: {id: {_eq: $id}, shared: {_eq: true}}) { id name slot source updated_at } }`,
    { id },
    "admin",
  );
  return data.blocks[0] ?? null;
}

export async function createBlock(userId: string, block: { name: string; source: string; slot: string; shared: boolean }): Promise<Block> {
  const data = await gql<{ insert_blocks_one: Block }>(`mutation($block: blocks_insert_input!) { insert_blocks_one(object: $block) { ${FIELDS} } }`, { block }, { userId });
  return data.insert_blocks_one;
}

export async function updateBlock(userId: string, id: string, changes: Partial<Pick<Block, "name" | "source" | "slot" | "shared">>): Promise<Block | null> {
  if (!UUID.test(id)) return null;
  const data = await gql<{ update_blocks_by_pk: Block | null }>(
    `mutation($id: uuid!, $changes: blocks_set_input!) { update_blocks_by_pk(pk_columns: {id: $id}, _set: $changes) { ${FIELDS} } }`,
    { id, changes },
    { userId },
  );
  return data.update_blocks_by_pk;
}

export async function deleteBlock(userId: string, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const data = await gql<{ delete_blocks_by_pk: { id: string } | null }>(`mutation($id: uuid!) { delete_blocks_by_pk(id: $id) { id } }`, { id }, { userId });
  return data.delete_blocks_by_pk !== null;
}
