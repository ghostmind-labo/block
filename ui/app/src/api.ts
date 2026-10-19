import type { Slot } from "@ghostmind-dev/block";
import { accessToken, SignedOut, signedIn } from "./auth";

export interface Block {
  id: string;
  name: string;
  slot: string;
  shared: boolean;
  source: string;
  /** The made-up data it was written with: what `block.self()` answers. */
  sample?: unknown;
  /** Its room and the data it shows, set by the person; null for a block made for one of the app's slots. */
  room?: Room | null;
  fields?: Field[] | null;
  /** The layout it was made from, whose source, room and fields it is drawn with. */
  layout_id?: string | null;
  layout?: { id: string; name: string } | null;
  updated_at: string;
  /** Whether the person looking at it is the one who made it. */
  mine?: boolean;
}
export type BlockSummary = Omit<Block, "source" | "sample"> & { bytes: number };
export type SlotInfo = Slot & { room: string };

async function call<T>(path: string, init: RequestInit = {}, { anonymous = false } = {}): Promise<T> {
  const send = async (force: boolean) => {
    const headers = new Headers(init.headers);
    if (init.body) headers.set("content-type", "application/json");
    // A shared block is read by people who never signed in: the token is sent when there is one.
    if (!anonymous || signedIn()) {
      try {
        headers.set("authorization", `Bearer ${await accessToken(force)}`);
      } catch (error) {
        if (!anonymous) throw error;
      }
    }
    return fetch(path, { ...init, headers });
  };
  let response = await send(false);
  if (response.status === 401 && signedIn()) response = await send(true);
  if (response.status === 401 && !anonymous) throw new SignedOut();
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? body.error_description ?? body.error ?? `The server answered ${response.status}`);
  return body as T;
}

export const getSlots = () => call<{ default: string; slots: SlotInfo[] }>("/api/slots", {}, { anonymous: true });
export const getMe = () => call<{ id: string; email: string }>("/api/me");
export const listBlocks = () => call<{ blocks: BlockSummary[] }>("/api/blocks").then((data) => data.blocks);
export const getBlock = (id: string) => call<Block>(`/api/blocks/${id}`, {}, { anonymous: true });
export const createBlock = (block: Pick<Block, "name" | "source" | "slot">) => call<Block>("/api/blocks", { method: "POST", body: JSON.stringify(block) });
export const updateBlock = (id: string, changes: Partial<Pick<Block, "name" | "source" | "slot" | "shared">>) => call<Block>(`/api/blocks/${id}`, { method: "PATCH", body: JSON.stringify(changes) });
export const deleteBlock = (id: string) => call<void>(`/api/blocks/${id}`, { method: "DELETE" });

// ---- the layout chat: the person's OpenRouter account, their live draft, a turn of the chat

export interface AiStatus {
  connected: boolean;
  key_hint: string | null;
  model: string;
  chosen: boolean;
  gone: boolean;
}
export interface CatalogModel {
  id: string;
  label: string;
  maker: string;
  note: string;
  latest: boolean;
  price: { input: number; output: number } | null;
  available: boolean;
}
export interface Room {
  width: { min?: number; max?: number } | null;
  height: { min?: number; max?: number } | null;
}
export interface Field {
  key: string;
  type: string;
}
/** A preset UI that accepts data (as in Potion): never shown on its own; blocks may be made from it. */
export interface Layout {
  id: string;
  name: string;
  source: string;
  room: Room | null;
  fields: Field[];
  sample: Record<string, unknown> | null;
  updated_at: string;
}
export type LayoutSummary = Omit<Layout, "source" | "sample">;

export interface Draft {
  /** What the studio is making: a layout, or a block for the gallery. */
  kind: "layout" | "block";
  /** A block draft: the layout whose look it inherits. */
  layout: { id: string; name: string; source: string } | null;
  source: string;
  name: string | null;
  slot: string;
  room: Room | null;
  fields: Field[];
  sample: Record<string, unknown> | null;
  version: number;
  updated_at: string | null;
  based_on: { id: string; name: string } | null;
}
export interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}
export interface ChatTurn {
  messages: ChatMessage[];
  reply: string | null;
  pending: { callId: string; tool: string; summary: string; detail?: string } | null;
  model: string | null;
  cost: number;
}

export const getAi = () => call<AiStatus>("/api/ai");
export const getModels = () => call<{ models: CatalogModel[]; default_model: string }>("/api/ai/models");
export const chooseModel = (model: string | null) => call<AiStatus>("/api/ai", { method: "PATCH", body: JSON.stringify({ model }) });
export const connectOpenRouter = (code: string, verifier: string) => call<AiStatus>("/api/ai/openrouter", { method: "POST", body: JSON.stringify({ code, verifier }) });
export const disconnectAi = () => call<void>("/api/ai", { method: "DELETE" });
/** The draft, or undefined while its version is still `since`. */
export const getDraft = (since?: number) => call<(Draft & { problems: string[] }) | undefined>(`/api/draft${since === undefined ? "" : `?since=${since}`}`);
export const writeDraft = (changes: {
  source?: string;
  name?: string | null;
  sample?: Record<string, unknown> | null;
  room?: Room;
  fields?: Field[];
  from?: string;
  fresh?: { room: Room; fields: Field[]; name: string | null };
  fresh_block?: { layout?: string | null; room?: Room; name?: string | null };
  from_block?: string;
}) => call<{ draft: Draft; problems: string[] }>("/api/draft", { method: "PATCH", body: JSON.stringify(changes) });
export const saveDraft = (options: { name?: string; as_new?: boolean } = {}) => call<{ kind: "layout" | "block"; id: string; name: string }>("/api/draft/save", { method: "POST", body: JSON.stringify(options) });
export const chatTurn = (input: { messages: ChatMessage[]; text?: string; approve?: { callId: string; approved: boolean } }, signal?: AbortSignal) =>
  call<ChatTurn>("/api/chat", { method: "POST", body: JSON.stringify(input), signal });

export const listLayouts = () => call<{ layouts: LayoutSummary[] }>("/api/layouts").then((data) => data.layouts);
export const getLayout = (id: string) => call<Layout>(`/api/layouts/${id}`);
export const deleteLayout = (id: string) => call<void>(`/api/layouts/${id}`, { method: "DELETE" });
