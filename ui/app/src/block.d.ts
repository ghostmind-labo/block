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
}
declare module "@ghostmind-dev/block/web" {
  import type { Loaded, Loader, Slot } from "@ghostmind-dev/block";
  export interface Mounted {
    frame: HTMLIFrameElement;
    libraries: Loaded[];
    destroy(): void;
  }
  export function mount(
    container: HTMLElement,
    html: string,
    options?: {
      loader?: Loader;
      names?: string[];
      slot?: Slot;
      scheme?: string;
      style?: string;
      title?: string;
      onReady?: () => void;
      onError?: (message: string) => void;
      onSize?: (size: { height: number | null; width: number | null }) => void;
    },
  ): Promise<Mounted>;
}
