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
}
