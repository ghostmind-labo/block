import { defineSlot, type Slot } from "@ghostmind-dev/block";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { deleteBlock, getBlock, getDraft, getSlots, listBlocks, updateBlock, type Block, type BlockSummary, type SlotInfo } from "./api";
import { finishSignIn, signedIn, signIn, signOut } from "./auth";
import { EXAMPLES } from "./examples";
import { BlockFrame, NO_REPORT, type Report, type Scheme } from "./frame";
import { Stage } from "./stage";
import { embedOf } from "./embed";
import { roomOf, roomText, slotFor } from "./room";

export const systemScheme = (): Scheme => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function useSlots() {
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
          {signedIn() ? <button className="quiet" onClick={signOut}>Sign out</button> : <button className="quiet" onClick={() => void signIn()}>Sign in</button>}
        </nav>
        {actions}
      </header>
      {children}
    </div>
  );
}

/** The slot tabs, the ground, and what the block reported: the same strip above every stage. */
export function Controls({ slots, slot, onSlot, scheme, onScheme, children }: { slots: SlotInfo[]; slot: string; onSlot: (name: string) => void; scheme: Scheme; onScheme: (scheme: Scheme) => void; children?: ReactNode }) {
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

export function Reported({ report, slot }: { report: Report; slot: SlotInfo }) {
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
  // a block being written and never saved is shown first, to go back to it
  const { data: draft } = useQuery({ queryKey: ["draft"], queryFn: () => getDraft() });
  const unsaved = draft && draft.source.trim() && !draft.based_on ? draft : null;
  return (
    <Shell>
      <main className="gallery">
        <header className="gallery-head">
          <h1>Blocks</h1>
          <Link to="/make" search={{ new: "" } as never} className="button add" aria-label="New block" title="New block">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Link>
        </header>
        {error && <p className="error">{error.message}</p>}
        {blocks?.length === 0 && !unsaved && <p className="empty">Nothing yet. A block is a piece of html: describe one to the chat, and watch it drawn.</p>}
        <div className="grid">
          {unsaved && (
            <Link to="/make" className="tile tile--draft">
              <div className="thumb thumb--draft">
                <span>Not saved</span>
              </div>
              <div className="tile-text">
                <strong>{unsaved.name ?? "Untitled"}</strong>
                <span>draft</span>
              </div>
            </Link>
          )}
          {blocks?.map((block) => <Tile key={block.id} block={block} />)}
        </div>
      </main>
    </Shell>
  );
}

// A block seen small. One with a width of its own (a card, a panel) is drawn at that width and scaled down only as
// much as the tile needs, in the middle; one as wide as its place (a page, a column) is drawn at three times the
// tile and scaled down, so it is the block and not a corner of it.
const WIDE = 3;
function Tile({ block }: { block: BlockSummary }) {
  const slots = useSlots();
  const box = useRef<HTMLAnchorElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [room, setRoom] = useState(0);
  useEffect(() => {
    const watcher = new IntersectionObserver(([entry]) => entry.isIntersecting && setSeen(true), { rootMargin: "200px" });
    watcher.observe(box.current!);
    const sized = new ResizeObserver(([entry]) => setRoom(entry.contentRect.width));
    sized.observe(thumb.current!);
    return () => {
      watcher.disconnect();
      sized.disconnect();
    };
  }, []);
  const { data } = useQuery({ queryKey: ["block", block.id], queryFn: () => getBlock(block.id), enabled: seen });
  const own = slots ? slotFor(block, slots.slots) : null;
  const width = own?.width?.max ?? null;
  const slot = useMemo<Slot | null>(() => (own ? (width ? { ...own, interactive: false } : defineSlot({ name: own.name, height: "fill", interactive: false })) : null), [own, width]);
  const scale = width && room ? Math.min(1, (room - 24) / width) : 1;
  return (
    <Link ref={box} to="/b/$id" params={{ id: block.id }} className="tile">
      <div ref={thumb} className={`thumb${width ? " thumb--small" : ""}`}>
        {data && slot && (
          <div
            className="thumb-inner"
            style={width ? { width, zoom: scale } : { width: `${WIDE * 100}%`, height: `${WIDE * 100}%`, transform: `scale(${1 / WIDE})` }}
          >
            <BlockFrame html={data.source} slot={slot} scheme={systemScheme()} title={block.name} sample={data.sample} bare />
          </div>
        )}
      </div>
      <div className="tile-text">
        <strong>{block.name}</strong>
        <span>
          {when(block.updated_at)}
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
  const navigate = useNavigate();
  const { data: block, error } = useQuery({ queryKey: ["block", id], queryFn: () => getBlock(id), retry: false });

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

  const slot = slotFor(block, slots.slots);
  // Someone a block was shared with sees the block, in its room, and nothing to change.
  // The picture of its link card is taken of this view (`?card`): the block alone, on a 1200×630 ground.
  if (new URLSearchParams(location.search).has("card")) return <CardView block={block} slot={slot} />;
  if (!block.mine) {
    return (
      <div className="shared">
        <Stage html={block.source} slot={slot} scheme={systemScheme()} title={block.name} sample={block.sample} />
        <footer>
          <span>{block.name}</span>
          <Link to="/">made with block</Link>
        </footer>
      </div>
    );
  }

  return <OwnBlock block={block} slots={slots.slots} onRemoved={() => void navigate({ to: "/" })} />;
}

/**
 * A shared block as the picture of its link card: alone on a 1200×630 ground, as wide as its room allows, scaled
 * down to fit when it is bigger. `data-card-ready` says it has drawn itself and had a moment to settle, for the
 * browser that takes the screenshot (mcp blocks/cards.ts).
 */
function CardView({ block, slot }: { block: Block; slot: Slot }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const later = setTimeout(() => {
      const size = box.current?.getBoundingClientRect();
      if (size) setScale(Math.min(1, 1104 / size.width, 534 / size.height));
      document.documentElement.setAttribute("data-card-ready", "");
    }, 1500);
    return () => clearTimeout(later);
  }, [ready]);
  return (
    <div className="card-view">
      <div ref={box} className="card-block" style={{ width: slot.width?.max ? Math.min(slot.width.max, 1104) : 1104, transform: `scale(${scale})` }}>
        <BlockFrame html={block.source} slot={slot} scheme="dark" title={block.name} sample={block.sample} bare onReport={(report) => report.state === "shown" && setReady(true)} />
      </div>
    </div>
  );
}

/** One of the person's blocks, in the gallery: drawn as it is, with Share, Embed (html that needs nothing), Edit (in the chat) and Delete. */
function OwnBlock({ block, slots, onRemoved }: { block: Block; slots: SlotInfo[]; onRemoved: () => void }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [errors, setErrors] = useState<string[]>([]);
  const [height, setHeight] = useState<number | null>(null);
  const [embedding, setEmbedding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const slot = slotFor(block, slots);
  const change = useMutation({
    mutationFn: (changes: Parameters<typeof updateBlock>[1]) => updateBlock(block.id, changes),
    onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: ["block", block.id] }), client.invalidateQueries({ queryKey: ["blocks"] })]),
  });
  const remove = useMutation({
    mutationFn: () => deleteBlock(block.id),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["blocks"] });
      onRemoved();
    },
  });
  const address = `${location.origin}/b/${block.id}`;
  return (
    <Shell>
      <main className="gallery-one">
        <header className="head">
          <div className="title">
            <h1>{block.name}</h1>
            <p className="meta">
              {roomText(roomOf(block, slots))} · changed {when(block.updated_at)}
            </p>
          </div>
          <div className="actions">
            <button className="icon-only" aria-label="Delete" title="Delete" onClick={() => setDeleting(true)}>
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
              </svg>
            </button>
            <button className={`quiet${block.shared ? " on" : ""}`} title={block.shared ? "Anyone with its address sees it. Click to stop sharing" : "Only you see it"} onClick={() => change.mutate({ shared: !block.shared })}>
              {block.shared ? "Shared" : "Share"}
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
                {copied ? "Copied" : "Copy address"}
              </button>
            )}
            <button className="quiet" onClick={() => setEmbedding(true)}>
              Embed
            </button>
            <button className="solid" onClick={() => void navigate({ to: "/make", search: { block: block.id } as never })}>
              Edit
            </button>
          </div>
        </header>
        <Stage
          html={block.source}
          slot={slot}
          scheme={systemScheme()}
          title={block.name}
          sample={block.sample}
          onReport={(report) => {
            setErrors(report.errors);
            if (report.size?.height) setHeight(report.size.height);
          }}
        />
        {errors.length > 0 && (
          <ul className="problems">
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        )}
        {change.error && <p className="error">{change.error.message}</p>}
        {embedding && <EmbedWindow block={block} slot={slot} height={height ?? slot.height?.max ?? 400} onClose={() => setEmbedding(false)} />}
        {deleting && (
          <div className="veil" onMouseDown={(event) => event.target === event.currentTarget && setDeleting(false)}>
            <div className="window window--ask" role="alertdialog" aria-modal="true">
              <p>Delete “{block.name}” for good? Its address stops working; html already embedded keeps showing it.</p>
              <div className="window-foot">
                <button className="text" onClick={() => setDeleting(false)}>
                  Cancel
                </button>
                <button className="solid" autoFocus onClick={() => remove.mutate()}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </Shell>
  );
}

/** The block as html that needs nothing: an iframe to paste anywhere, or a page of its own to download. */
function EmbedWindow({ block, slot, height, onClose }: { block: Block; slot: Slot; height: number; onClose: () => void }) {
  const [made, setMade] = useState<{ page: string; snippet: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [scheme, setScheme] = useState<Scheme>(systemScheme);
  useEffect(() => {
    setMade(null);
    embedOf(block, slot, height, scheme).then(setMade, (error: Error) => setProblem(error.message));
  }, [block, slot, height, scheme]);
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => event.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  const download = () => {
    if (!made) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([made.page], { type: "text/html" }));
    link.download = `${block.name.replace(/[^\w -]+/g, "").trim() || "block"}.html`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };
  const kb = made ? Math.round(new Blob([made.snippet]).size / 1024) : 0;
  return (
    <div className="veil" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="window" role="dialog" aria-modal="true" aria-label="Embed">
        <h2>Embed</h2>
        <p className="hint">The whole block in html: its libraries and its data inside, nothing fetched, the same wherever it is pasted. Paste the snippet in a page, or download it as a page of its own.</p>
        {problem && <p className="pane-problem">{problem}</p>}
        {made ? <pre className="embed-code">{made.snippet.slice(0, 1200)}{made.snippet.length > 1200 ? "\n…" : ""}</pre> : !problem && <p className="hint">Putting it together…</p>}
        <div className="window-foot">
          <button className="text" onClick={() => setScheme(scheme === "dark" ? "light" : "dark")} title="Its ground, whatever the page around it">
            {scheme === "dark" ? "Dark" : "Light"}
          </button>
          <span className="hint">{made ? `${kb} KB` : ""}</span>
          <span className="spacer" />
          <button className="text" disabled={!made} onClick={download}>
            Download .html
          </button>
          <button
            className="solid"
            disabled={!made}
            onClick={() => {
              if (!made) return;
              void navigator.clipboard.writeText(made.snippet).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? "Copied" : "Copy html"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- trying one without keeping it

export function TryPage() {
  const slots = useSlots();
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
