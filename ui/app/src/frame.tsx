import { makeLoader, type Loaded, type Slot } from "@ghostmind-dev/block";
import { mount, type Mounted } from "@ghostmind-dev/block/web";
import { useEffect, useRef, useState } from "react";

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
  const block = useRef<Mounted | null>(null);
  const tell = useRef(onReport);
  tell.current = onReport;
  // A block that is as tall as its content can be shown on the whole screen for a while. One that fills its
  // place is already the window, and one that is only looked at has nothing to scroll.
  const expandable = !slot.fill && slot.interactive;
  const [expanded, setExpanded] = useState(false);
  const wide = useRef(expanded);
  wide.current = expanded;

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
      // Escape pressed inside the frame never reaches this page: the block passes it on.
      onEscape: () => setExpanded(false),
    }).then((made) => {
      if (gone) return made.destroy();
      mounted = block.current = made;
      // A block made again while the screen is its place (its source changed) takes that place again.
      made.expand(wide.current);
      say({ libraries: made.libraries });
    });
    return () => {
      gone = true;
      block.current = null;
      mounted?.destroy();
    };
  }, [html, slot, scheme, title]);

  useEffect(() => {
    block.current?.expand(expanded);
    if (!expanded) return;
    // The page behind does not scroll under the block, and Escape on the page closes it too.
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setExpanded(false);
    addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  const frame = <div ref={host} className={`frame-host${slot.fill ? " frame-host--fill" : ""}`} />;
  if (!expandable) return frame;
  // The frame is never moved: the box around it is restyled to cover the screen, so the block keeps its state.
  return (
    <div className={`frame-box${expanded ? ` frame-box--expanded frame-box--${scheme}` : ""}`}>
      <button className="quiet expand" onClick={() => setExpanded(!expanded)} title={expanded ? "Back to its place (Esc)" : "Show it on the whole screen"}>
        {expanded ? "Close" : "Expand"}
      </button>
      {frame}
    </div>
  );
}
