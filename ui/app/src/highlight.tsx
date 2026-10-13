import type { ReactNode } from "react";

// A block's source, coloured. One pass over the text; at each place the first kind that matches wins. It is a
// reading aid for html, css and script in one text, not a parser: it never changes a character.
const KINDS = [
  ["comment", /<!--[\s\S]*?-->|\/\*[\s\S]*?\*\/|(?<![:\\])\/\/[^\n]*/],
  ["string", /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/],
  // an opening tag only after a space or another tag, so that `a<b` in a script is left alone; a closing one anywhere
  ["tag", /(?<=^|[\s>])<[a-zA-Z][\w-]*|<\/[a-zA-Z][\w-]*/],
  ["keyword", /\b(?:const|let|var|function|return|if|else|for|while|of|in|new|class|async|await|true|false|null|undefined|this|typeof|break|continue|switch|case|default|try|catch|throw)\b/],
  ["number", /#[0-9a-fA-F]{3,8}\b|(?<![\w.])\d*\.?\d+(?:px|em|rem|vh|vw|ms|s|%)?(?!\w)/],
] as const;
const ALL = new RegExp(KINDS.map(([, kind]) => `(${kind.source})`).join("|"), "gm");

export function highlighted(source: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let done = 0;
  for (const match of source.matchAll(ALL)) {
    const at = match.index;
    if (at > done) parts.push(source.slice(done, at));
    const [kind] = KINDS[match.slice(1).findIndex((group) => group !== undefined)];
    parts.push(
      <span key={at} className={`tok-${kind}`}>
        {match[0]}
      </span>,
    );
    done = at + match[0].length;
  }
  if (done < source.length) parts.push(source.slice(done));
  return parts;
}
