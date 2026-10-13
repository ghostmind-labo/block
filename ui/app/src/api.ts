import type { Slot } from "@ghostmind-dev/block";
import { accessToken, SignedOut, signedIn } from "./auth";

export interface Block {
  id: string;
  name: string;
  slot: string;
  shared: boolean;
  source: string;
  updated_at: string;
  /** Whether the person looking at it is the one who made it. */
  mine?: boolean;
}
export type BlockSummary = Omit<Block, "source"> & { bytes: number };
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
