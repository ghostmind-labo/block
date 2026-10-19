import type { Slot } from "@ghostmind-dev/block";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BlockFrame, type Report, type Scheme } from "./frame";

const Lines = ({ count }: { count: number }) => (
  <div className="lines" aria-hidden>
    {Array.from({ length: count }, (_, i) => (
      <span key={i} style={{ width: `${[96, 88, 93, 71, 90, 84, 62][i % 7]}%` }} />
    ))}
  </div>
);

/**
 * A block in the place it was written for. Around the frame is only a sketch of that place (lines for a note's
 * text, a grid for a map), so that the block is seen at the size and in the company it will have in an app.
 */
export function Stage({ html, slot, scheme, title, sample, onReport }: { html: string; slot: Slot; scheme: Scheme; title: string; sample?: unknown; onReport?: (report: Report) => void }) {
  // A block's own room (the slot `roomSlot` makes, named "layout" by the package) is drawn alone, with nothing around it.
  const own = slot.name === "layout";
  const frame = <BlockFrame html={html} slot={slot} scheme={scheme} title={title} sample={sample} onReport={onReport} bare={own} />;
  return (
    <div className={`stage stage--${scheme}`} data-slot={slot.name}>
      {surround(slot, frame)}
    </div>
  );
}

function surround(slot: Slot, frame: ReactNode) {
  if (slot.name === "layout") return <Room slot={slot}>{frame}</Room>;
  if (slot.fill) return <div className="place place--page">{frame}</div>;
  if (slot.name === "panel") return <Panel slot={slot}>{frame}</Panel>;
  if (slot.shrink) return <Hover>{frame}</Hover>;
  if (!slot.interactive)
    return (
      <div className="place place--cards">
        <div className="cover">{frame}</div>
        <div className="cover cover--other" aria-hidden />
        <div className="cover cover--other" aria-hidden />
      </div>
    );
  return (
    <div className="place place--note" style={{ maxWidth: slot.width?.max ?? undefined }}>
      <Lines count={4} />
      {frame}
      <Lines count={5} />
    </div>
  );
}

/** A panel beside something else: its width is the reader's to drag, between the slot's two ends. */
function Panel({ slot, children }: { slot: Slot; children: ReactNode }) {
  const min = slot.width?.min ?? 240;
  const max = slot.width?.max ?? 560;
  const [width, setWidth] = useState(Math.min(max, Math.max(min, 320)));
  return (
    <div className="place place--panel">
      <div className="beside" aria-hidden />
      <div className="panel" style={{ width }}>
        <label className="panel-width">
          <input type="range" min={min} max={max} value={width} onChange={(event) => setWidth(Number(event.target.value))} />
          <span>{width} px</span>
        </label>
        {children}
      </div>
    </div>
  );
}

/** The box under the mouse: it follows the pointer over the sketch, and rests in the middle when the pointer is away. */
function Hover({ children }: { children: ReactNode }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  return (
    <div
      className="place place--hover"
      onPointerMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        setAt({ x: event.clientX - box.left, y: event.clientY - box.top });
      }}
      onPointerLeave={() => setAt(null)}
    >
      <div className="beside" aria-hidden />
      <div className="under-mouse" style={at ? { left: at.x + 14, top: at.y + 14 } : { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}>
        {children}
      </div>
    </div>
  );
}

/** A block's own room: the frame on a plain ground, with the size it is drawn at under it. */
function Room({ slot, children }: { slot: Slot; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const seen = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.round(width), height: Math.round(height) });
    });
    if (box.current) seen.observe(box.current);
    return () => seen.disconnect();
  }, []);
  return (
    // The ground fits the block: as wide as its room allows, never a wide empty canvas around a small block.
    <div className={`place place--room${slot.width?.max ? "" : " place--room-full"}`}>
      <div className="room-frame" ref={box} style={{ width: slot.width?.max ? `${slot.width.max}px` : "100%", maxWidth: "100%" }}>
        {children}
      </div>
      {size && size.height > 0 && (
        <p className="room-size">
          {size.width} × {size.height} px
        </p>
      )}
    </div>
  );
}
