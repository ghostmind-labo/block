// Types of @ghostmind-dev/block, written by hand: the package is plain JavaScript with no build. They follow
// the JSDoc in the source; a test checks that every export of the JavaScript is declared here.

// ---- policy.js

/** The frame's `sandbox` attribute: scripts, and nothing else. */
export const SANDBOX: string;
/** The Content-Security-Policy written into a block's document. */
export const POLICY: string;
/** The policy of a block in a native app's web view: POLICY, and the players of EMBEDS in `frame-src`. */
export const WEBVIEW_POLICY: string;
export const COVER_SANDBOX: string;
export const COVER_POLICY: string;
/** What the page that shows blocks adds to its own policy: `frame-src` with the players of EMBEDS. */
export const PAGE_POLICY: string;
/** The players a block may show (`<block-embed>`), as `frame-src` paths. A closed list. */
export const EMBEDS: readonly string[];

// ---- parse.js

export interface LibrarySpec { name: string; version: string; path?: string; as?: string }
export interface Directive { name: string; text: string }
export function specOf(text: string): LibrarySpec;
export function parse(html: string, options?: { names?: string[] }): { source: string; libraries: LibrarySpec[]; directives: Directive[]; cover: string | null };

// ---- host.js

export interface Host { readonly name: string; readonly calls: readonly string[]; readonly watches: readonly string[]; readonly events: readonly string[] }
export interface Target { post: (message: object) => void }
export type Handlers = Record<string, (...args: any[]) => any>;
export interface ServeOptions {
  onReady?: () => void;
  onHeight?: (height: number, width: number) => void;
  onError?: (message: string) => void;
  /** A link was clicked in the block: its `href`, as written. */
  onLink?: (href: string) => void;
  /** ms a call may take (default 30 s; 0: no limit), or one per call. */
  timeout?: number | ((call: string, args: any[]) => number);
  /** At most `calls` in any `per` ms. */
  rate?: { calls: number; per: number };
}
export interface Served {
  /** Each message that came from THIS frame. */
  receive(data: unknown): void;
  /** Sends one of the host's declared events to the block. */
  emit(event: string, value: unknown): void;
  /** Ends every watch and waiting call. */
  stop(): void;
}
export function defineHost(definition: { name: string; calls?: string[]; watches?: string[]; events?: string[]; client?: string }): Host;
export function bridgeScript(host: Host): string;
export function serve(host: Host, target: Target, handlers?: Handlers, options?: ServeOptions): Served;

// ---- slot.js

export interface Range { min?: number | null; max?: number | null }
export interface Slot {
  readonly name: string;
  readonly what: string;
  readonly width: Range | null;
  readonly height: Range | null;
  readonly fill: boolean;
  readonly shrink: boolean;
  readonly interactive: boolean;
}
export function defineSlot(definition: { name: string; what?: string; width?: number | Range; height?: "fill" | number | Range; shrink?: boolean; interactive?: boolean }): Slot;
export function slotText(slot: Slot): string;
/** The height and width a frame is given for what its block reported, inside the slot. */
export function fit(slot: Slot | undefined | null, size: { height: number; width: number }): { height: number | null; width: number | null };

// ---- document.js

export interface LoadedLibrary { name: string; version?: string; source?: string; styles?: string }
export type Scheme = "light" | "dark" | "light dark";
export interface DocumentOptions {
  host?: Host;
  libraries?: LoadedLibrary[];
  slot?: Slot;
  /** inline: as tall as its content, reported to the app. fill: as tall as the frame. */
  mode?: "inline" | "fill";
  scheme?: Scheme;
  /** The app's first styles for every block. */
  style?: string;
  /** "webview" for a native app's web view. */
  transport?: "frame" | "webview";
  viewport?: string;
  expanded?: boolean;
  /** Answered by `<host>.args()` in the block. Only with a host. */
  args?: Record<string, string | number | boolean>;
}
export function documentOf(source: string, options?: DocumentOptions): string;
export function coverOf(markup: string, options?: { scheme?: Scheme; style?: string }): string;
/** A block that shows what went wrong, in place of the one that could not load. */
export function problem(lines: string[]): string;
export function esc(text: unknown): string;

// ---- libraries.js

export class LibraryError extends Error {}
export function validVersion(version: unknown): boolean;
export function pin(version: string): string;
export function globalOf(name: string, path?: string): string;
export function classicOf(text: string): { code: string; needs: string[]; exports: string[] };
export interface LibraryDescription { name: string; global: string; category: string; summary: string; when: string; use: string; kind: "code" | "styles" }
export function describe(name?: undefined | null, options?: { catalogue?: object; directive?: string }): { libraries: LibraryDescription[]; any: string };
export function describe(name: string, options?: { catalogue?: object; directive?: string }): { library: LibraryDescription & { styled: boolean; sandbox: string[] } } | null;
export interface Loader {
  load(name: string, version: string): Promise<LoadedLibrary>;
  loadAll(list: LibrarySpec[]): Promise<{ libraries: LoadedLibrary[]; problems: string[] }>;
}
export function makeLoader(options?: { catalogue?: object; fetch?: typeof fetch; cdn?: string }): Loader;

// ---- webview.js

export const WEBVIEW_SCRIPT: string;
/** `inject` runs a script in the web view (`webRef.current.injectJavaScript`). */
export function webviewTarget(inject: (javascript: string) => void): Target;
export function fromWebview(data: unknown): object | null;

// ---- rules.js

export const RULES: readonly string[];
export function instructions(options?: { slots?: Slot[]; host?: Host; calls?: Record<string, string>; sample?: unknown; extra?: string }): string;

// ---- check.js

export const SOURCE_MAX_BYTES: number;
export function sourceProblems(source: string, options?: { names?: string[] }): string[];
export function roomAdvice(source: string, options?: { slot?: Slot }): string[];

// ---- draft.js

export interface Tool { name: string; description: string; parameters: object; write?: boolean }
export interface Field { key: string; type: string }
export interface Room { width: Range | null; height: Range | null }
export const FIELD_TYPES: readonly string[];
export const DRAFT_TOOLS: readonly Tool[];
export function asFunctions(tools: readonly Tool[]): { type: "function"; function: { name: string; description: string; parameters: object } }[];
export function saving(draft: { kind?: string; name?: string | null; based_on?: { id: string; name: string; used_by?: number } | null }, args?: { name?: string; as_new?: boolean }): string;
/** The name `saving` had until 0.4.1. */
export const publishing: typeof saving;
export function selfHost(name: string): Host;
export function shapeOf(sample: unknown, prefix?: string): { key: string; kind: string }[];
export function placeholders(fields: Field[]): Record<string, unknown>;
export function checkRoom(room: unknown): Room;
export function roomSlot(room: unknown, options?: { name?: string; what?: string }): Slot;
export function checkFields(fields: unknown): Field[];
export function fieldsText(fields: unknown): string;

// ---- turn.js

export function runTurn(options: {
  converse: (request: { messages: object[] }) => Promise<{ message: object; model?: string; cost?: number }>;
  tools: { name: string; write?: boolean }[];
  run: (name: string, args: object) => Promise<unknown>;
  describe?: (name: string, args: object) => { summary: string; detail?: string };
  system: string;
  messages?: object[];
  text?: string;
  approve?: { callId: string; approved: boolean };
  maxSteps?: number;
  maxText?: number;
}): Promise<{ messages: object[]; reply: string | null; pending: { callId: string; tool: string; args: object; summary: string; detail?: string } | null; model: string | null; cost: number }>;

// ---- embed.js

export type EmbedSite = "youtube" | "vimeo" | "spotify" | "reddit" | "instagram";
/** The player an address is shown with, or null when it is not one of EMBEDS. */
export function embedOf(address: string): { site: EmbedSite; src: string; ratio?: number; height?: number } | null;
/** The script that makes `<block-embed>` in a block. `nested`: in a web view, the block frames the player itself. */
export function embedScript(nested: boolean): string;
/** What a player is sent to seek, play or pause it, and to which origin. */
export function playerMessage(site: string, act: "seek" | "play" | "pause", value?: number): [message: string, origin: string] | null;

// ---- pictures.js

export interface Pictures { bring: (address: string) => Promise<string> }
export function picturesIn(source: string): string[];
export function makePictures(options?: { fetch?: (address: string) => Promise<Response>; relay?: (address: string) => Promise<Response>; maxBytes?: number }): Pictures;
export function bringPictures(source: string, pictures: Pictures | undefined): Promise<{ source: string; problems: string[] }>;
