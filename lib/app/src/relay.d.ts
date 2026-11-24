// Types of "@ghostmind-dev/block/server", written by hand (see index.d.ts).
import type { lookup } from "node:dns/promises";

export class PictureError extends Error {
  constructor(status: number, message: string);
  status: number;
}
export function isPrivateAddress(address: string): boolean;
export function relayPicture(address: string, options?: { fetch?: typeof fetch; maxBytes?: number; timeout?: number; resolve?: typeof lookup }): Promise<{ type: string; bytes: Uint8Array }>;
