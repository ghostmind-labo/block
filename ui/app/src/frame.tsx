import { makeLoader, type Loaded, type Slot } from "@ghostmind-dev/block";
import { mount, type Mounted } from "@ghostmind-dev/block/web";
import { useEffect, useRef } from "react";

/** The directive spellings read here: the package's own, and each app's, so a block written for one of them is shown as it is. */
const DIRECTIVES = ["potion", "relay", "tags"];
// One loader for the page: two blocks that name the same library at the same moment make one request.
const loader = makeLoader();

export type Scheme = "light" | "dark";
/** What the app gives every block first: its type and its ink. The block's own styles win over these. */
const FIRST_STYLE: Record<Scheme, string> = {
  light: "body { font: 15px/1.5 ui-sans-serif, system-ui, sans-serif; color: #26262a; }",
  dark: "body { font: 15px/1.5 ui-sans-serif, system-ui, sans-serif; color: #e8e6e1; }",
};

export interface Report {
  state: "loading" | "shown";
  libraries: Loaded[];
  errors: string[];
  size: { height: number | null; width: number | null } | null;
}
export const NO_REPORT: Report = { state: "loading", libraries: [], errors: [], size: null };

/** One block in its frame, kept inside its slot. Everything is the package's `mount`; this only ties it to React. */
export function BlockFrame({ html, slot, scheme, title, onReport }: { html: string; slot: Slot; scheme: Scheme; title: string; onReport?: (report: Report) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const tell = useRef(onReport);
  tell.current = onReport;

  useEffect(() => {
    let gone = false;
    let mounted: Mounted | null = null;
    let report: Report = NO_REPORT;
    const say = (change: Partial<Report>) => {
      report = { ...report, ...change };
      if (!gone) tell.current?.(report);
    };
    say({});
    mount(host.current!, html, {
      loader,
      names: DIRECTIVES,
      slot,
      scheme,
      style: FIRST_STYLE[scheme],
      title,
      onReady: () => say({ state: "shown" }),
      onError: (message) => say({ errors: [...report.errors, message] }),
      onSize: (size) => say({ size }),
    }).then((block) => {
      if (gone) return block.destroy();
      mounted = block;
      say({ libraries: block.libraries });
    });
    return () => {
      gone = true;
      mounted?.destroy();
    };
  }, [html, slot, scheme, title]);

  return <div ref={host} className={`frame-host${slot.fill ? " frame-host--fill" : ""}`} />;
}
