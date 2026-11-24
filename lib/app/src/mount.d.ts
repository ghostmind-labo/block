// Types of "@ghostmind-dev/block/web", written by hand (see index.d.ts).
import type { Host, Handlers, Loader, Pictures, Slot, Scheme, Directive, LoadedLibrary } from "./index.js";

export interface MountOptions {
  host?: Host;
  /** One function per call and per watch the host declares. */
  handlers?: Handlers;
  /** ms a call may take (default 30 s). */
  timeout?: number | ((call: string, args: any[]) => number);
  rate?: { calls: number; per: number };
  /** From `makeLoader()`; without it a block that names a library is refused. */
  loader?: Loader;
  /** From `makePictures()`; without it pictures by address are left out. */
  pictures?: Pictures;
  /** The directive names this app reads, besides `block`. */
  names?: string[];
  slot?: Slot;
  mode?: "inline" | "fill";
  scheme?: Scheme;
  style?: string;
  args?: Record<string, string | number | boolean>;
  /** What a screen reader calls the frame. */
  title?: string;
  /** The reader's text size, 0.5 to 3. */
  scale?: number;
  onLink?: (href: string) => void;
  onEscape?: () => void;
  onReady?: () => void;
  /** Something threw in the block, or a library or a picture it named could not be brought. */
  onError?: (message: string) => void;
  onSize?: (size: { height: number | null; width: number | null }) => void;
}

export interface Mounted {
  frame: HTMLIFrameElement;
  directives: Directive[];
  libraries: LoadedLibrary[];
  emit: (event: string, value: unknown) => void;
  /** The block is shown bigger for a while: the frame takes its container's size. */
  expand: (on: boolean) => void;
  scale: (n: number) => void;
  destroy: () => void;
}

export function mount(container: HTMLElement, html: string, options?: MountOptions): Promise<Mounted>;
