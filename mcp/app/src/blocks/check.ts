import { makeLoader, parse } from "@ghostmind-dev/block";

/** The directive spellings read here: the package's own, and each app's, so a block written for one of them can be tried as it is. */
export const DIRECTIVES = ["potion", "relay", "tags"];
export const SOURCE_MAX_BYTES = 200_000;

const loader = makeLoader();

export interface Brought {
  name: string;
  version: string;
  global?: string;
  exports?: string[];
  kind: "global" | "styles";
  bytes: number;
}

/** What a block names, brought the way a page will bring it: the globals it gets, or why one could not be brought. */
export async function bring(source: string): Promise<{ libraries: Brought[]; problems: string[] }> {
  const { libraries, problems } = await loader.loadAll(parse(source, { names: DIRECTIVES }).libraries);
  return {
    problems,
    libraries: libraries.map((library) => ({
      name: `${library.name}${library.path ?? ""}`,
      version: library.version,
      kind: library.source ? "global" : "styles",
      ...(library.source ? { global: library.global } : {}),
      // Enough of the exports to see what the global holds; three has hundreds.
      ...(library.exports?.length ? { exports: library.exports.slice(0, 60) } : {}),
      bytes: (library.source?.length ?? 0) + (library.styles?.length ?? 0),
    })),
  };
}

/** Why a source cannot be kept, or null. */
export function sourceProblem(source: string): string | null {
  if (!source.trim()) return "the source is empty";
  const bytes = Buffer.byteLength(source);
  if (bytes > SOURCE_MAX_BYTES) return `the source is ${bytes} bytes; a block is ${SOURCE_MAX_BYTES} at most`;
  if (/^\s*```/.test(source)) return "the source starts with a ``` fence: give the html itself";
  return null;
}
