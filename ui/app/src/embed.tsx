import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { getBlock } from "./api";
import { BlockFrame } from "./frame";
import { systemScheme, useSlots } from "./pages";
import { slotFor } from "./room";

// A shared block, alone, for another site to show in an <iframe>: no header, no ground of its own, the block in
// its room with its data. A block here is deterministic (block.self() answers the data it was published with),
// so it needs nothing from this app once drawn. The page tells the one that embeds it how tall it is, for a
// frame that follows the block's height (`{ type: "block-embed-size", id, height }`).

export function EmbedPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const slots = useSlots();
  const { data: block, error } = useQuery({ queryKey: ["block", id], queryFn: () => getBlock(id), retry: false });
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.add("embedded");
    return () => document.documentElement.classList.remove("embedded");
  }, []);

  useEffect(() => {
    if (!box.current || parent === window) return;
    const seen = new ResizeObserver(([entry]) => {
      parent.postMessage({ type: "block-embed-size", id, height: Math.ceil(entry.contentRect.height) }, "*");
    });
    seen.observe(box.current);
    return () => seen.disconnect();
  }, [id, block]);

  // Only a block its owner shared is shown here, even to its owner: what is embedded is what anyone sees.
  if (error || (block && !block.shared)) return <p className="embed-missing">This block is not shared.</p>;
  if (!block || !slots) return null;
  const slot = slotFor(block, slots.slots);
  return (
    <div ref={box} className="embed" style={{ maxWidth: slot.width?.max ?? undefined }}>
      <BlockFrame html={block.source} slot={slot} scheme={systemScheme()} title={block.name} sample={block.sample} bare />
    </div>
  );
}
