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
  export interface Loaded {
    name: string;
    version: string;
    path?: string;
    global?: string;
    source?: string;
    styles?: string;
  }
  export interface Loader {
    loadAll(list: unknown[]): Promise<{ libraries: Loaded[]; problems: string[] }>;
  }
  export function makeLoader(options?: { fetch?: typeof fetch }): Loader;
  export function parse(html: string, options?: { names?: string[] }): { source: string; libraries: unknown[]; directives: { name: string; text: string }[]; cover: string | null };
  export interface Pictures {
    bring(address: string): Promise<string>;
  }
  export function picturesIn(source: string): string[];
  export function makePictures(options?: { fetch?: (address: string) => Promise<Response>; relay?: (address: string) => Promise<Response>; maxBytes?: number }): Pictures;
  export function bringPictures(source: string, pictures?: Pictures): Promise<{ source: string; problems: string[] }>;
  export function documentOf(source: string, options?: { libraries?: Loaded[]; slot?: Slot; mode?: "inline" | "fill"; scheme?: string; style?: string }): string;
  export interface Host {
    readonly name: string;
    readonly calls: readonly string[];
  }
  export function selfHost(name: string): Host;
  export function shapeOf(sample: unknown): { key: string; kind: string }[];
  export const FIELD_TYPES: readonly string[];
  export function placeholders(fields: { key: string; type: string }[]): Record<string, unknown>;
  export function roomSlot(room: unknown, options?: { name?: string; what?: string }): Slot;
  export function saving(draft: { kind?: string; name?: string | null; based_on?: { id: string; name: string; used_by?: number } | null }, args?: { name?: string; as_new?: boolean }): string;
  export const publishing: typeof saving;
}
declare module "@ghostmind-dev/block/web" {
  import type { Host, Loaded, Loader, Slot } from "@ghostmind-dev/block";
  export interface Mounted {
    frame: HTMLIFrameElement;
    libraries: Loaded[];
    /** Shown bigger for a while: the frame takes its container's size and the block scrolls inside itself. */
    expand(on: boolean): void;
    destroy(): void;
  }
  export function mount(
    container: HTMLElement,
    html: string,
    options?: {
      loader?: Loader;
      pictures?: import("@ghostmind-dev/block").Pictures;
      host?: Host;
      handlers?: Record<string, (...args: unknown[]) => unknown>;
      names?: string[];
      slot?: Slot;
      scheme?: string;
      style?: string;
      title?: string;
      onEscape?: () => void;
      onReady?: () => void;
      onError?: (message: string) => void;
      onSize?: (size: { height: number | null; width: number | null }) => void;
    },
  ): Promise<Mounted>;
}
