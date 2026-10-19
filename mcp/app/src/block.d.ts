// @ghostmind-dev/block is plain JavaScript (lib/app). What this app uses of it, typed.
declare module "@ghostmind-dev/block" {
  export interface Size {
    min: number | null;
    max: number | null;
  }
  export interface Slot {
    readonly name: string;
    readonly what: string;
    readonly width: Size | null;
    readonly height: Size | null;
    readonly fill: boolean;
    readonly shrink: boolean;
    readonly interactive: boolean;
  }
  export function defineSlot(definition: { name: string; what?: string; width?: number | { min?: number; max?: number }; height?: "fill" | number | { min?: number; max?: number }; shrink?: boolean; interactive?: boolean }): Slot;
  export function slotText(slot: Slot): string;

  export interface Named {
    name: string;
    version: string;
    path?: string;
    as?: string;
  }
  export function parse(html: string, options?: { names?: string[] }): { source: string; libraries: Named[]; directives: { name: string; text: string }[]; cover: string | null };

  export interface Loaded {
    name: string;
    version: string;
    path?: string;
    global?: string;
    kind?: "module";
    exports?: string[];
    source?: string;
    styles?: string;
  }
  export function makeLoader(options?: { fetch?: typeof fetch }): { loadAll(list: Named[]): Promise<{ libraries: Loaded[]; problems: string[] }> };
  export function describe(name?: string, options?: { directive?: string }): { libraries?: Record<string, unknown>[]; any?: string; library?: Record<string, unknown> } | null;

  export const RULES: readonly string[];
  export function instructions(options?: { slots?: Slot[]; host?: Host; calls?: Record<string, string>; sample?: unknown; extra?: string }): string;
  export const SOURCE_MAX_BYTES: number;
  export function sourceProblems(source: string, options?: { names?: string[] }): string[];
  export function roomAdvice(source: string, options?: { slot?: Slot }): string[];
  export interface DraftTool {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    write?: boolean;
  }
  export const DRAFT_TOOLS: readonly DraftTool[];
  export interface Host {
    readonly name: string;
    readonly calls: readonly string[];
    readonly watches: readonly string[];
    readonly events: readonly string[];
  }
  export function selfHost(name: string): Host;
  export function shapeOf(sample: unknown): { key: string; kind: string }[];
  export interface Room {
    width: { min?: number; max?: number } | null;
    height: { min?: number; max?: number } | null;
  }
  export interface Field {
    key: string;
    type: string;
  }
  export const FIELD_TYPES: readonly string[];
  export function placeholders(fields: { key: string; type: string }[]): Record<string, unknown>;
  export function checkRoom(room: unknown): Room;
  export function roomSlot(room: unknown, options?: { name?: string; what?: string }): Slot;
  export function checkFields(fields: unknown): Field[];
  export function fieldsText(fields: unknown): string;
  export function asFunctions(tools: readonly DraftTool[]): { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }[];
  export function saving(draft: { kind?: string; name?: string | null; based_on?: { id: string; name: string; used_by?: number } | null }, args?: { name?: string; as_new?: boolean }): string;
  export const publishing: typeof saving;
  export interface Pending {
    callId: string;
    tool: string;
    args: Record<string, unknown>;
    summary: string;
    detail?: string;
  }
  export function runTurn<M extends { role: string }>(options: {
    converse: (request: { messages: M[] }) => Promise<{ message: M; model?: string; cost?: number }>;
    tools: readonly { name: string; write?: boolean }[];
    run: (name: string, args: Record<string, unknown>) => Promise<unknown>;
    describe?: (name: string, args: Record<string, unknown>) => { summary: string; detail?: string };
    system: string;
    messages?: M[];
    text?: string;
    approve?: { callId: string; approved: boolean };
    maxSteps?: number;
    maxText?: number;
  }): Promise<{ messages: M[]; reply: string | null; pending: Pending | null; model: string | null; cost: number }>;
}

declare module "@ghostmind-dev/block/server" {
  export class PictureError extends Error {
    status: number;
  }
  export function isPrivateAddress(address: string): boolean;
  export function relayPicture(address: string, options?: { fetch?: typeof fetch; maxBytes?: number; timeout?: number }): Promise<{ type: string; bytes: Uint8Array }>;
}
