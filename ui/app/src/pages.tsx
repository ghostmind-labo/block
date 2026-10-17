import { defineSlot, type Slot } from "@ghostmind-dev/block";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createBlock, deleteBlock, getBlock, getSlots, listBlocks, updateBlock, type BlockSummary, type SlotInfo } from "./api";
import { finishSignIn, signedIn, signIn, signOut } from "./auth";
import { ThemePicker } from "./colors";
import { EXAMPLES } from "./examples";
import { BlockFrame, NO_REPORT, type Report, type Scheme } from "./frame";
import { highlighted } from "./highlight";
import { Stage } from "./stage";

const systemScheme = (): Scheme => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function useSlots() {
  const { data } = useQuery({ queryKey: ["slots"], queryFn: getSlots, staleTime: Infinity });
  return data;
}

export function Shell({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="shell">
      <header className="bar">
        <Link to="/" className="mark">
          <i aria-hidden /> block
        </Link>
        <nav>
          <Link to="/try">Try one</Link>
          <ThemePicker />
          {signedIn() ? <button className="quiet" onClick={signOut}>Sign out</button> : <button className="quiet" onClick={() => void signIn()}>Sign in</button>}
        </nav>
        {actions}
      </header>
      {children}
    </div>
  );
}

/** The slot tabs, the ground, and what the block reported: the same strip above every stage. */
function Controls({ slots, slot, onSlot, scheme, onScheme, children }: { slots: SlotInfo[]; slot: string; onSlot: (name: string) => void; scheme: Scheme; onScheme: (scheme: Scheme) => void; children?: ReactNode }) {
  return (
    <div className="controls">
      <div className="tabs" role="tablist" aria-label="Slot">
        {slots.map((each) => (
          <button key={each.name} role="tab" aria-selected={each.name === slot} title={each.room} onClick={() => onSlot(each.name)}>
            {each.name}
          </button>
        ))}
      </div>
      <button className="quiet" onClick={() => onScheme(scheme === "dark" ? "light" : "dark")} title="The ground the block is shown on">
        {scheme === "dark" ? "Dark ground" : "Light ground"}
      </button>
      {children}
    </div>
  );
}

function Reported({ report, slot }: { report: Report; slot: SlotInfo }) {
  return (
    <div className="reported">
      {report.size && !slot.fill && (
        <p>
          Shown at {report.size.width ? `${report.size.width} × ` : ""}
          {report.size.height} px.
        </p>
      )}
      {report.libraries.length > 0 && (
        <p>
          Brought:{" "}
          {report.libraries.map((library) => (
            <code key={`${library.name}${library.path ?? ""}`}>
              {library.name}
              {library.path ?? ""}@{library.version}
              {library.source ? ` → ${library.global}` : ""}
            </code>
          ))}
        </p>
      )}
      {report.errors.map((message, index) => (
        <p key={index} className="error">
          {message}
        </p>
      ))}
    </div>
  );
}

// ---- the person's blocks

export function HomePage() {
  if (!signedIn()) return <Welcome />;
  return <Gallery />;
}

function Welcome() {
  return (
    <Shell>
      <main className="welcome">
        <h1>One piece of html, shown anywhere.</h1>
        <p>A block is a chart, a small page, a widget or a drawing, written by you or by an AI. It runs in a frame that reaches nothing: no network, no storage, not the page around it.</p>
        <div className="row">
          <button onClick={() => void signIn()}>Sign in with Google</button>
          <Link to="/try" className="button quiet">
            Try one first
          </Link>
        </div>
      </main>
    </Shell>
  );
}

function Gallery() {
  const { data: blocks, error } = useQuery({ queryKey: ["blocks"], queryFn: listBlocks });
  return (
    <Shell>
      <main className="gallery">
        <h1>Your blocks</h1>
        {error && <p className="error">{error.message}</p>}
        {blocks?.length === 0 && (
          <p className="empty">
            Nothing yet. Ask Claude to make one (the block plugin), or <Link to="/try">write one here</Link>.
          </p>
        )}
        <div className="grid">{blocks?.map((block) => <Tile key={block.id} block={block} />)}</div>
      </main>
    </Shell>
  );
}

// A block seen small. One made for a whole page or a column is drawn at three times the tile and scaled down,
// so it is the block and not a corner of it; one made for a small place is shown at its own size.
const WIDE = 3;
function Tile({ block }: { block: BlockSummary }) {
  const slots = useSlots();
  const box = useRef<HTMLAnchorElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const watcher = new IntersectionObserver(([entry]) => entry.isIntersecting && setSeen(true), { rootMargin: "200px" });
    watcher.observe(box.current!);
    return () => watcher.disconnect();
  }, []);
  const { data } = useQuery({ queryKey: ["block", block.id], queryFn: () => getBlock(block.id), enabled: seen });
  const own = slots?.slots.find((slot) => slot.name === block.slot);
  const small = Boolean(own && own.width?.max && own.width.max <= 320);
  const slot = useMemo<Slot | null>(() => (own ? (small ? { ...own, interactive: false } : defineSlot({ name: own.name, height: "fill", interactive: false })) : null), [own, small]);
  return (
    <Link ref={box} to="/b/$id" params={{ id: block.id }} className="tile">
      <div className={`thumb${small ? " thumb--small" : ""}`}>
        {data && slot && (
          <div className="thumb-inner" style={small ? undefined : { width: `${WIDE * 100}%`, height: `${WIDE * 100}%`, transform: `scale(${1 / WIDE})` }}>
            <BlockFrame html={data.source} slot={slot} scheme={systemScheme()} title={block.name} />
          </div>
        )}
      </div>
      <div className="tile-text">
        <strong>{block.name}</strong>
        <span>
          {block.slot} · {when(block.updated_at)}
          {block.shared ? " · shared" : ""}
        </span>
      </div>
    </Link>
  );
}

// ---- one block

export function BlockPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const slots = useSlots();
  const client = useQueryClient();
  const navigate = useNavigate();
  const { data: block, error } = useQuery({ queryKey: ["block", id], queryFn: () => getBlock(id), retry: false });
  const [slotName, setSlotName] = useState<string | null>(null);
  const [scheme, setScheme] = useState<Scheme>(systemScheme);
  const [report, setReport] = useState<Report>(NO_REPORT);
  const [showSource, setShowSource] = useState(false);
  const [copied, setCopied] = useState(false);
  const code = useMemo(() => (showSource && block ? highlighted(block.source) : null), [showSource, block]);

  const change = useMutation({
    mutationFn: (changes: Parameters<typeof updateBlock>[1]) => updateBlock(id, changes),
    onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: ["block", id] }), client.invalidateQueries({ queryKey: ["blocks"] })]),
  });
  const remove = useMutation({
    mutationFn: () => deleteBlock(id),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["blocks"] });
      await navigate({ to: "/" });
    },
  });

  if (error) {
    return (
      <Shell>
        <main className="welcome">
          <h1>Nothing here</h1>
          <p>{error.message}</p>
          {!signedIn() && <button onClick={() => void signIn()}>Sign in</button>}
        </main>
      </Shell>
    );
  }
  if (!block || !slots) return <Shell>{null}</Shell>;

  const slot = slots.slots.find((each) => each.name === (slotName ?? block.slot)) ?? slots.slots[0];
  // Someone a block was shared with sees the block, in its slot, and nothing to change.
  if (!block.mine) {
    return (
      <div className="shared">
        <Stage html={block.source} slot={slot} scheme={scheme} title={block.name} />
        <footer>
          <span>{block.name}</span>
          <Link to="/">made with block</Link>
        </footer>
      </div>
    );
  }

  const address = `${location.origin}/b/${block.id}`;
  return (
    <Shell>
      <main className="one">
        <div className="title">
          <h1>{block.name}</h1>
          <span>changed {when(block.updated_at)}</span>
        </div>
        <Controls slots={slots.slots} slot={slot.name} onSlot={setSlotName} scheme={scheme} onScheme={setScheme}>
          {slot.name !== block.slot && (
            <button className="quiet" onClick={() => change.mutate({ slot: slot.name })} title={`It was written for ${block.slot}`}>
              Keep it in {slot.name}
            </button>
          )}
          <span className="spacer" />
          <div className="tabs" role="tablist" aria-label="What is shown">
            <button role="tab" aria-selected={!showSource} onClick={() => setShowSource(false)}>
              Block
            </button>
            <button role="tab" aria-selected={showSource} onClick={() => setShowSource(true)}>
              Code
            </button>
          </div>
          <button className="quiet" onClick={() => change.mutate({ shared: !block.shared })}>
            {block.shared ? "Stop sharing" : "Share"}
          </button>
          {block.shared && (
            <button
              className="quiet"
              onClick={() => {
                void navigator.clipboard.writeText(address).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? "Copied" : "Copy its address"}
            </button>
          )}
          <button className="quiet danger" onClick={() => confirm(`Delete "${block.name}" for good?`) && remove.mutate()}>
            Delete
          </button>
        </Controls>
        {/* The code takes the block's place. The block stays where it is, unseen, so it keeps its size and what it was doing. */}
        <div className={`view${showSource ? " view--code" : ""}`}>
          <Stage html={block.source} slot={slot} scheme={scheme} title={block.name} onReport={setReport} />
          {showSource && <pre className="source">{code}</pre>}
        </div>
        <Reported report={report} slot={slot} />
        {change.error && <p className="error">{change.error.message}</p>}
      </main>
    </Shell>
  );
}

// ---- trying one without keeping it

export function TryPage() {
  const slots = useSlots();
  const navigate = useNavigate();
  const [source, setSource] = useState(EXAMPLES[0].source);
  const [shown, setShown] = useState(source);
  const [slotName, setSlotName] = useState(EXAMPLES[0].slot);
  const [scheme, setScheme] = useState<Scheme>(systemScheme);
  const [report, setReport] = useState<Report>(NO_REPORT);

  // The block is redrawn a moment after the last key, not on each one.
  useEffect(() => {
    const later = setTimeout(() => setShown(source), 500);
    return () => clearTimeout(later);
  }, [source]);

  const keep = useMutation({
    mutationFn: () => createBlock({ name: prompt("A name for this block")?.trim() || "Untitled", source, slot: slotName }),
    onSuccess: (block) => navigate({ to: "/b/$id", params: { id: block.id } }),
  });

  if (!slots) return <Shell>{null}</Shell>;
  const slot = slots.slots.find((each) => each.name === slotName) ?? slots.slots[0];
  return (
    <Shell>
      <main className="try">
        <section className="write">
          <select
            aria-label="Start from"
            value=""
            onChange={(event) => {
              const example = EXAMPLES[Number(event.target.value)];
              if (!example) return;
              setSource(example.source);
              setShown(example.source);
              setSlotName(example.slot);
            }}
          >
            <option value="">Start from…</option>
            {EXAMPLES.map((example, index) => (
              <option key={example.name} value={index}>
                {example.name}
              </option>
            ))}
          </select>
          <textarea spellCheck={false} value={source} onChange={(event) => setSource(event.target.value)} aria-label="The block's html" />
          {signedIn() && (
            <button onClick={() => keep.mutate()} disabled={keep.isPending}>
              Keep this block
            </button>
          )}
          {keep.error && <p className="error">{keep.error.message}</p>}
        </section>
        <section className="see">
          <Controls slots={slots.slots} slot={slot.name} onSlot={setSlotName} scheme={scheme} onScheme={setScheme} />
          <Stage html={shown} slot={slot} scheme={scheme} title="The block being tried" onReport={setReport} />
          <Reported report={report} slot={slot} />
        </section>
      </main>
    </Shell>
  );
}

// ---- signing in

export function CallbackPage() {
  const navigate = useNavigate();
  const [problem, setProblem] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    finishSignIn(new URLSearchParams(location.search)).then(
      () => navigate({ to: "/" }),
      (error: Error) => setProblem(error.message),
    );
  }, [navigate]);
  return (
    <Shell>
      <main className="welcome">{problem ? <p className="error">{problem}</p> : <p>Signing you in…</p>}</main>
    </Shell>
  );
}
