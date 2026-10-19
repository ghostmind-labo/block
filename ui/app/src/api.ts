import type { Slot } from "@ghostmind-dev/block";
import { accessToken, SignedOut, signedIn } from "./auth";

export interface Block {
  id: string;
  name: string;
  slot: string;
  shared: boolean;
  source: string;
  /** What `block.self()` answers in it, for a block that keeps its data apart from its html. Usually none. */
  sample?: unknown;
  /** Its room; null for a block made for one of the app's slots. */
  room?: Room | null;
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
/** A picture a block shows, through this app's server: for a host that refuses a browser on another site. */
export async function relayedPicture(address: string): Promise<Response> {
  const headers = new Headers();
  if (signedIn()) headers.set("authorization", `Bearer ${await accessToken().catch(() => "")}`);
  return fetch(`/api/picture?url=${encodeURIComponent(address)}`, { headers });
}
export const deleteBlock = (id: string) => call<void>(`/api/blocks/${id}`, { method: "DELETE" });

// ---- the block chat: the person's OpenRouter account, their live draft, a turn of the chat

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
export interface Draft {
  source: string;
  name: string | null;
  slot: string;
  room: Room | null;
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
  /** One of the person's blocks to start from. */
  from?: string;
  /** A new, empty block: the draft is thrown away. */
  fresh?: { room?: Room; name?: string | null };
}) => call<{ draft: Draft; problems: string[] }>("/api/draft", { method: "PATCH", body: JSON.stringify(changes) });
export const saveDraft = (options: { name?: string; as_new?: boolean } = {}) => call<{ id: string; name: string }>("/api/draft/save", { method: "POST", body: JSON.stringify(options) });
export const chatTurn = (input: { messages: ChatMessage[]; text?: string; approve?: { callId: string; approved: boolean } }, signal?: AbortSignal) =>
  call<ChatTurn>("/api/chat", { method: "POST", body: JSON.stringify(input), signal });

