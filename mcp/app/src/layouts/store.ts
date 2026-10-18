/**
 * A person's layouts (table `layouts`), as in Potion: a layout is a preset UI that accepts data, not a block. Its
 * source reads the object it shows with `block.self()`; its room is where it fits; its fields are the data that
 * object has; its sample is made-up data to draw it with. A block may be made from a layout and its own data, and
 * is then drawn with the layout's source as it is now.
 */
import { gql } from "../db/hasura.ts";
import { createBlock, type Block } from "../blocks/store.ts";

export interface Field {
  key: string;
  type: string;
}
export interface Layout {
  id: string;
  name: string;
  source: string;
  room: Block["room"];
  fields: Field[];
  sample: unknown;
  created_at: string;
  updated_at: string;
}
export type LayoutSummary = Omit<Layout, "source" | "sample">;

const FIELDS = "id name source room fields sample created_at updated_at";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const layoutOf = (row: Layout): Layout => ({ ...row, fields: row.fields ?? [] });

export async function listLayouts(userId: string): Promise<LayoutSummary[]> {
  const data = await gql<{ layouts: Layout[] }>(`query { layouts(order_by: {updated_at: desc}) { id name room fields created_at updated_at } }`, {}, { userId });
  return data.layouts.map((row) => ({ ...row, fields: row.fields ?? [] }));
}

export async function getLayout(userId: string, id: string): Promise<Layout | null> {
  if (!UUID.test(id)) return null;
  const data = await gql<{ layouts_by_pk: Layout | null }>(`query($id: uuid!) { layouts_by_pk(id: $id) { ${FIELDS} } }`, { id }, { userId });
  return data.layouts_by_pk ? layoutOf(data.layouts_by_pk) : null;
}

/** A layout by its id or its name (what a model or a person says). */
export async function findLayout(userId: string, which: string): Promise<Layout | null> {
  const byId = await getLayout(userId, which);
  if (byId) return byId;
  const named = (await listLayouts(userId)).find((layout) => layout.name.toLowerCase() === which.trim().toLowerCase());
  return named ? getLayout(userId, named.id) : null;
}

export async function createLayout(userId: string, layout: Pick<Layout, "name" | "source" | "room" | "fields" | "sample">): Promise<Layout> {
  const data = await gql<{ insert_layouts_one: Layout }>(`mutation($layout: layouts_insert_input!) { insert_layouts_one(object: $layout) { ${FIELDS} } }`, { layout }, { userId });
  return layoutOf(data.insert_layouts_one);
}

export async function updateLayout(userId: string, id: string, changes: Partial<Pick<Layout, "name" | "source" | "room" | "fields" | "sample">>): Promise<Layout | null> {
  if (!UUID.test(id)) return null;
  const data = await gql<{ update_layouts_by_pk: Layout | null }>(
    `mutation($id: uuid!, $changes: layouts_set_input!) { update_layouts_by_pk(pk_columns: {id: $id}, _set: $changes) { ${FIELDS} } }`,
    { id, changes },
    { userId },
  );
  return data.update_layouts_by_pk ? layoutOf(data.update_layouts_by_pk) : null;
}

/** Deletes a layout; the blocks made from it keep the copy of its source they were made with. */
export async function deleteLayout(userId: string, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const data = await gql<{ delete_layouts_by_pk: { id: string } | null }>(`mutation($id: uuid!) { delete_layouts_by_pk(id: $id) { id } }`, { id }, { userId });
  return data.delete_layouts_by_pk !== null;
}

/** The data of a block made from a layout: only the layout's fields, none of them required. */
export function checkData(layout: Pick<Layout, "name" | "fields">, data: Record<string, unknown>) {
  const keys = new Set(layout.fields.map((field) => field.key));
  const unknown = Object.keys(data).filter((key) => !keys.has(key));
  if (unknown.length) throw new Error(`the layout "${layout.name}" does not read ${unknown.join(", ")}: its fields are ${[...keys].join(", ") || "none"}`);
}

/** A new block from a layout and its own data. It is drawn with the layout's source as it is now. */
export async function createFromLayout(userId: string, { layout: which, name, data, shared = false }: { layout: string; name: string; data: Record<string, unknown>; shared?: boolean }): Promise<Block> {
  const layout = await findLayout(userId, which);
  if (!layout) throw new Error(`no layout "${which}": list_layouts has their ids, names and fields`);
  checkData(layout, data);
  return createBlock(userId, { name, source: layout.source, slot: "layout", shared, sample: data, room: layout.room, layout_id: layout.id });
}
