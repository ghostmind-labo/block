import { FIELD_TYPES, placeholders, saving, type Slot } from "@ghostmind-dev/block";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { chatTurn, chooseModel, deleteLayout, disconnectAi, getLayout, listLayouts, type LayoutSummary, getAi, getDraft, getModels, saveDraft, writeDraft, type AiStatus, type CatalogModel, type ChatMessage, type ChatTurn, type Draft, type Field, type Room } from "./api";
import { signedIn, signIn } from "./auth";
import { NO_REPORT, type Report } from "./frame";
import { connectAi, finishConnectAi } from "./openrouter";
import { highlighted } from "./highlight";
import { roomOf, roomText, slotFor } from "./room";
import { Shell, systemScheme, useSlots } from "./pages";
import { Stage } from "./stage";

// ---- the layouts: block is the playground where a layout is made for the apps that show it. The person's
// layouts are on the left; one is drawn on the right. Editing one turns the left into a chat with their own
// model, which writes the live draft; the draft is drawn again each time anyone writes it (the chat, an agent
// on the MCP, the Code and Data panes). A layout's room and the data it shows are the person's to set.

const POLL_MS = 1000;
const KEPT = "block.chat";

/** What the person sees of a tool the model used. */
const STEPS: Record<string, string> = {
  read_draft: "Read the draft",
  write_draft: "Wrote the draft",
  save_draft: "Saved it",
  load_draft: "Opened a layout",
  list_layouts: "Looked at your layouts",
  get_layout: "Read a layout",
  list_libraries: "Looked up a library",
};

type Line = { kind: "you" | "ai" | "step" | "error"; text: string };

function linesOf(messages: ChatMessage[]): Line[] {
  const answers = new Map(messages.filter((m) => m.role === "tool").map((m) => [m.tool_call_id, m.content ?? ""]));
  const lines: Line[] = [];
  for (const message of messages) {
    if (message.role === "user" && message.content) lines.push({ kind: "you", text: message.content });
    if (message.role !== "assistant") continue;
    if (message.content?.trim()) lines.push({ kind: "ai", text: message.content.trim() });
    for (const call of message.tool_calls ?? []) {
      const answer = answers.get(call.id);
      if (answer === undefined) continue;
      let said = STEPS[call.function.name] ?? call.function.name;
      try {
        const parsed = JSON.parse(answer) as { declined?: boolean; error?: string; problems?: string[] };
        if (parsed?.declined) said = `Declined: ${said.toLowerCase()}`;
        else if (parsed?.error) said = `${said}: ${parsed.error}`;
        else if (parsed?.problems?.length) said = `${said}, ${parsed.problems.length} ${parsed.problems.length === 1 ? "thing" : "things"} to fix`;
      } catch {
        // an answer that is not JSON is shown as the step alone
      }
      lines.push({ kind: "step", text: said });
    }
  }
  return lines;
}

const keptChat = (): ChatMessage[] => {
  try {
    return JSON.parse(sessionStorage.getItem(KEPT) ?? "[]") as ChatMessage[];
  } catch {
    return [];
  }
};
const keepChat = (messages: ChatMessage[]) => {
  try {
    sessionStorage.setItem(KEPT, JSON.stringify(messages.slice(-80)));
  } catch {
    // a tab that keeps nothing starts the conversation again on reload
  }
};

// ---- a layout's room and data, in words and as a slot


export function MakePage() {
  if (!signedIn()) {
    return (
      <Shell>
        <main className="welcome">
          <h1>Layouts</h1>
          <p>Sign in to make layouts with your own model: set the room and the data, describe it, and watch it drawn while it is written.</p>
          <button onClick={() => void signIn()}>Sign in with Google</button>
        </main>
      </Shell>
    );
  }
  return <Layouts />;
}

function Layouts() {
  const slots = useSlots();
  const client = useQueryClient();
  const navigate = useNavigate();
  const { data: ai } = useQuery({ queryKey: ["ai"], queryFn: getAi });
  const { data: layouts } = useQuery({ queryKey: ["layouts"], queryFn: listLayouts });
  const draft = useDraft();
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [settings, setSettings] = useState<"new-layout" | "new-block" | "edit" | null>(null);
  const [blockFrom, setBlockFrom] = useState<string | null>(null);
  // Another draft is another conversation.
  const [round, setRound] = useState(0);
  const [asking, ask] = useAsk();

  // A block opened from the gallery (`/make?block=<id>`) goes straight into the editor.
  const opened = useRef(false);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("block");
    if (!id || opened.current || !draft.current) return;
    opened.current = true;
    void (async () => {
      if (draft.current?.kind !== "block" || draft.current.based_on?.id !== id) {
        await draft.write({ from_block: id });
        keepChat([]);
        setRound((n) => n + 1);
      }
      setEditing(true);
      history.replaceState(null, "", "/make");
    })();
  }, [draft]);

  const shown = selected ?? layouts?.[0]?.id ?? null;
  if (!slots || !layouts || !draft.current) return <Shell>{null}</Shell>;
  const current = draft.current;
  const unsaved = Boolean(current.source.trim()) && !current.based_on;
  const what = current.kind === "block" ? "block" : "layout";

  const startOver = () => {
    keepChat([]);
    setRound((n) => n + 1);
  };
  const replacing = async () => !unsaved || (await ask(`The ${what} “${current.name ?? "untitled"}” was not saved. Starting another replaces it.`, "Start another"));
  const edit = async (id: string) => {
    if (current.kind !== "layout" || current.based_on?.id !== id) {
      if (!(await replacing())) return;
      await draft.write({ from: id });
      startOver();
    }
    setEditing(true);
  };

  // Editing is the whole window: the chat and the draft, nothing above them.
  const Frame = editing ? FullPage : Shell;
  return (
    <Frame>
      <main className={`layouts${editing ? " layouts--editing" : ""}`}>
        <aside className="side">
          {editing ? (
            <>
              <button
                className="back"
                onClick={() => {
                  setEditing(false);
                  if (current.kind === "layout") setSelected(current.based_on?.id ?? selected);
                }}
              >
                ← Studio
              </button>
              {ai && (ai.connected ? <Chat key={round} ai={ai} /> : <Connect />)}
            </>
          ) : (
            <LayoutList
              layouts={layouts}
              slots={slots.slots}
              shown={shown}
              onShow={setSelected}
              onNewLayout={() => setSettings("new-layout")}
              onNewBlock={() => {
                setBlockFrom(null);
                setSettings("new-block");
              }}
              draft={current.version > 0 && !current.based_on && current.source.trim() ? current : null}
              onDraft={() => setEditing(true)}
            />
          )}
        </aside>
        <section className="main">
          {editing ? (
            <Workspace
              draft={draft}
              slots={slots.slots}
              ask={ask}
              onSettings={() => setSettings("edit")}
              onSaved={(kept) => {
                void client.invalidateQueries({ queryKey: [kept.kind === "block" ? "blocks" : "layouts"] });
                if (kept.kind === "block") void client.invalidateQueries({ queryKey: ["block", kept.id] });
              }}
              onGallery={(id) => void navigate({ to: "/b/$id", params: { id } })}
            />
          ) : shown ? (
            <LayoutView
              id={shown}
              slots={slots.slots}
              onEdit={() => void edit(shown)}
              onBlock={() => {
                setBlockFrom(shown);
                setSettings("new-block");
              }}
              onDelete={async (name) => {
                if (!(await ask(`Delete the layout “${name}” for good? The blocks made from it keep their look.`, "Delete"))) return;
                await deleteLayout(shown);
                setSelected(null);
                await client.invalidateQueries({ queryKey: ["layouts"] });
              }}
            />
          ) : (
            <div className="nothing">
              <p>Nothing in the studio yet.</p>
              <div className="row">
                <button className="solid" onClick={() => setSettings("new-layout")}>
                  New layout
                </button>
                <button className="quiet" onClick={() => setSettings("new-block")}>
                  New block
                </button>
              </div>
            </div>
          )}
        </section>
        {(settings === "new-layout" || settings === "edit") && (
          <RoomAndData
            title={settings === "edit" ? "Room & data" : "New layout"}
            action={settings === "edit" ? "Save" : "Start"}
            withFields={settings === "new-layout" || current.kind === "layout"}
            initial={settings === "edit" ? { name: current.name ?? "", room: roomOf(current, slots.slots), fields: current.fields } : { name: "", room: { width: { max: 480 }, height: null }, fields: [{ key: "name", type: "text" }] }}
            onClose={() => setSettings(null)}
            onSave={async ({ name, room, fields }) => {
              if (settings === "new-layout") {
                if (!(await replacing())) return;
                await draft.write({ fresh: { room, fields, name: name || null } });
                startOver();
                setEditing(true);
              } else {
                await draft.write({ room, fields, name: name || null });
              }
              setSettings(null);
            }}
          />
        )}
        {settings === "new-block" && (
          <NewBlock
            layouts={layouts}
            from={blockFrom}
            onClose={() => setSettings(null)}
            onStart={async ({ name, layout, room }) => {
              if (!(await replacing())) return;
              await draft.write({ fresh_block: { name: name || null, layout, room } });
              startOver();
              setSettings(null);
              setEditing(true);
            }}
          />
        )}
        {asking}
      </main>
    </Frame>
  );
}

type Question = { text: string; yes: string; resolve: (ok: boolean) => void };

/** A question asked on the page, never in a browser dialog: `await ask("…", "Save")` is true on yes. */
function useAsk() {
  const [question, setQuestion] = useState<Question | null>(null);
  const ask = useCallback((text: string, yes: string) => new Promise<boolean>((resolve) => setQuestion({ text, yes, resolve })), []);
  const answer = (ok: boolean) => {
    question?.resolve(ok);
    setQuestion(null);
  };
  const node = question ? <Ask text={question.text} yes={question.yes} onAnswer={answer} /> : null;
  return [node, ask] as const;
}

function Ask({ text, yes, onAnswer }: { text: string; yes: string; onAnswer: (ok: boolean) => void }) {
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => event.key === "Escape" && onAnswer(false);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onAnswer]);
  return (
    <div className="veil" onMouseDown={(event) => event.target === event.currentTarget && onAnswer(false)}>
      <div className="window window--ask" role="alertdialog" aria-modal="true" aria-label={text}>
        <p>{text}</p>
        <div className="window-foot">
          <button className="text" onClick={() => onAnswer(false)}>
            Cancel
          </button>
          <button className="solid" autoFocus onClick={() => onAnswer(true)}>
            {yes}
          </button>
        </div>
      </div>
    </div>
  );
}

const FullPage = ({ children }: { children: ReactNode }) => <div className="full">{children}</div>;

function LayoutList({ layouts, slots, shown, onShow, onNewLayout, onNewBlock, draft, onDraft }: { layouts: LayoutSummary[]; slots: Slot[]; shown: string | null; onShow: (id: string) => void; onNewLayout: () => void; onNewBlock: () => void; draft: Draft | null; onDraft: () => void }) {
  return (
    <nav className="list" aria-label="Studio">
      <div className="list-head">
        <h2>Layouts</h2>
        <button className="text" onClick={onNewLayout}>
          New
        </button>
      </div>
      <ul>
        {draft && (
          <li>
            <button onClick={onDraft} title="Not saved yet: open it to go on">
              <span>{draft.name ?? "Untitled"}</span>
              <small>
                {draft.kind} draft · {roomText(roomOf(draft, slots))}
              </small>
            </button>
          </li>
        )}
        {layouts.map((layout) => (
          <li key={layout.id}>
            <button aria-current={layout.id === shown} onClick={() => onShow(layout.id)}>
              <span>{layout.name}</span>
              <small>{roomText(roomOf({ room: layout.room, slot: "layout" }, slots))}</small>
            </button>
          </li>
        ))}
      </ul>
      <div className="list-foot">
        <button className="text" onClick={onNewBlock}>
          New block →
        </button>
        <Link to="/" className="text-link">
          Gallery
        </Link>
      </div>
    </nav>
  );
}

/** One layout: drawn in its room with its made-up data. Edit it, or make a block from it. */
function LayoutView({ id, slots, onEdit, onBlock, onDelete }: { id: string; slots: Slot[]; onEdit: () => void; onBlock: () => void; onDelete: (name: string) => Promise<void> }) {
  const { data: layout } = useQuery({ queryKey: ["layout", id], queryFn: () => getLayout(id) });
  const [errors, setErrors] = useState<string[]>([]);
  if (!layout) return null;
  const slot = slotFor({ room: layout.room, slot: "layout" }, slots);
  return (
    <>
      <header className="head">
        <div className="title">
          <h1>{layout.name}</h1>
          <Meta room={roomOf({ room: layout.room, slot: "layout" }, slots)} fields={layout.fields} />
        </div>
        <div className="actions">
          <button className="icon-only" aria-label="Delete" title="Delete" onClick={() => void onDelete(layout.name)}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
            </svg>
          </button>
          <button className="quiet" onClick={onBlock}>
            Make a block
          </button>
          <button className="solid" onClick={onEdit}>
            Edit
          </button>
        </div>
      </header>
      <Stage html={layout.source} slot={slot} scheme={systemScheme()} title={layout.name} sample={placeholders(layout.fields)} onReport={(report) => setErrors(report.errors)} />
      <Errors errors={errors} />
    </>
  );
}

/** A new block: from one of the layouts (its look, filled with the block's own data), or from nothing, in a room. */
function NewBlock({ layouts, from, onClose, onStart }: { layouts: LayoutSummary[]; from: string | null; onClose: () => void; onStart: (value: { name: string; layout: string | null; room?: Room }) => Promise<void> }) {
  const [name, setName] = useState("");
  const [layout, setLayout] = useState<string>(from ?? "");
  const [width, setWidth] = useState("480");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => event.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  const start = async () => {
    setBusy(true);
    try {
      await onStart({ name: name.trim(), layout: layout || null, room: layout ? undefined : { width: Number(width) ? { max: Number(width) } : null, height: null } });
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="veil" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="window" role="dialog" aria-modal="true" aria-label="New block">
        <h2>New block</h2>
        <p className="hint">Finished content for the gallery, to share or embed. The chat makes it with you.</p>
        <label className="field">
          <span>Name</span>
          <input autoFocus value={name} placeholder="Pizzeria Napoletana" onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="field">
          <span>From</span>
          <select value={layout} onChange={(event) => setLayout(event.target.value)}>
            <option value="">Nothing: its own html</option>
            {layouts.map((each) => (
              <option key={each.id} value={each.id}>
                The layout “{each.name}”
              </option>
            ))}
          </select>
        </label>
        {!layout && (
          <label className="field">
            <span>Width, at most</span>
            <div className="combo">
              <input inputMode="numeric" value={width} onChange={(event) => setWidth(event.target.value.replace(/\D/g, ""))} aria-label="Width in px" />
              <em>px</em>
            </div>
          </label>
        )}
        {problem && <p className="pane-problem">{problem}</p>}
        <div className="window-foot">
          <button className="text" onClick={onClose}>
            Cancel
          </button>
          <button className="solid" disabled={busy} onClick={() => void start()}>
            Start
          </button>
        </div>
      </div>
    </div>
  );
}

function Meta({ room, fields, onClick }: { room: Room; fields: Field[]; onClick?: () => void }) {
  const text = `${roomText(room)} · ${fields.length ? fields.map((field) => field.key).join(", ") : "no data"}`;
  return onClick ? (
    <button className="meta meta--button" onClick={onClick} title="Room & data">
      {text}
    </button>
  ) : (
    <p className="meta">{text}</p>
  );
}

const Errors = ({ errors }: { errors: string[] }) =>
  errors.length ? (
    <ul className="problems">
      {errors.map((error, index) => (
        <li key={index}>{error}</li>
      ))}
    </ul>
  ) : null;

/** The layout being edited: its name, its room and data, and the draft drawn, as code, or as its data. */
function Workspace({ draft, slots, ask, onSettings, onSaved, onGallery }: { draft: ReturnType<typeof useDraft>; slots: Slot[]; ask: (text: string, yes: string) => Promise<boolean>; onSettings: () => void; onSaved: (kept: { kind: "layout" | "block"; id: string; name: string }) => void; onGallery: (id: string) => void }) {
  const current = draft.current!;
  const [view, setView] = useState<"preview" | "code" | "data">("preview");
  const [report, setReport] = useState<Report>(NO_REPORT);
  const [status, setStatus] = useState<{ text: string; block?: string } | null>(null);
  const save = useMutation({
    mutationFn: () => saveDraft(),
    onSuccess: (kept) => {
      setStatus({ text: `Saved as “${kept.name}”.`, ...(kept.kind === "block" ? { block: kept.id } : {}) });
      onSaved(kept);
    },
    onError: (error) => setStatus({ text: error.message }),
  });
  const what = current.kind === "block" ? "block" : "layout";
  const slot = slotFor(current, slots);
  const empty = !current.source.trim();
  return (
    <>
      <header className="head">
        <div className="title">
          <span className={`kind kind--${what}`}>{current.kind === "block" && current.layout ? `block · from ${current.layout.name}` : what}</span>
          <DraftName draft={current} onWrite={draft.write} />
          <Meta room={roomOf(current, slots)} fields={current.fields} onClick={onSettings} />
        </div>
        <button className="quiet" onClick={onSettings}>
          Room & data
        </button>
        <button className="solid" disabled={empty || save.isPending} onClick={() => void ask(saving(current), "Save").then((ok) => ok && save.mutate())}>
          Save
        </button>
      </header>
      <div className="tabs-line" role="tablist" aria-label="What is shown">
        {(["preview", "code", "data"] as const).map((each) => (
          <button key={each} role="tab" aria-selected={view === each} onClick={() => setView(each)}>
            {each === "preview" ? "Preview" : each === "code" ? "Code" : "Data"}
          </button>
        ))}
        {status && (
          <span className="status">
            {status.text}{" "}
            {status.block && (
              <button className="text" onClick={() => onGallery(status.block!)}>
                Open in the gallery
              </button>
            )}
          </span>
        )}
      </div>
      <div className={`view live${draft.flash ? " live--flash" : ""}${view !== "preview" ? " view--code" : ""}`}>
        {empty ? (
          <div className="draft-empty">
            <p>Describe the {what} in the chat.</p>
          </div>
        ) : (
          <Stage html={current.source} slot={slot} scheme={systemScheme()} title={current.name ?? "The draft"} sample={current.kind === "layout" ? placeholders(current.fields) : current.sample} onReport={setReport} />
        )}
        {view === "code" && <TextPane key="code" label={`The ${what}'s html`} text={current.source} onSave={(source) => draft.write({ source })} onEditing={draft.setEditing} />}
        {view === "data" && <DataPane draft={current} onWrite={draft.write} onEditing={draft.setEditing} />}
      </div>
      <Errors errors={[...draft.problems, ...report.errors]} />
    </>
  );
}

/** A window over the page: the layout's name, its room and the data it shows. */
function RoomAndData({ title, action, initial, withFields = true, onClose, onSave }: { title: string; action: string; initial: { name: string; room: Room; fields: Field[] }; withFields?: boolean; onClose: () => void; onSave: (value: { name: string; room: Room; fields: Field[] }) => Promise<void> }) {
  const [name, setName] = useState(initial.name);
  const mode = (value: Room["width"], none: string) => (!value ? none : value.min && value.min === value.max ? "exactly" : "max");
  const [widthMode, setWidthMode] = useState(mode(initial.room.width, "full"));
  const [width, setWidth] = useState(String(initial.room.width?.max ?? 480));
  const [heightMode, setHeightMode] = useState(mode(initial.room.height, "content"));
  const [height, setHeight] = useState(String(initial.room.height?.max ?? 360));
  const [fields, setFields] = useState<Field[]>(initial.fields.length ? initial.fields : [{ key: "", type: "text" }]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => event.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  const sideOf = (which: string, value: string) => {
    const n = Number(value);
    if (which === "full" || which === "content") return null;
    return which === "exactly" ? { min: n, max: n } : { max: n };
  };
  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await onSave({ name: name.trim(), room: { width: sideOf(widthMode, width), height: sideOf(heightMode, height) }, fields: fields.filter((field) => field.key.trim()).map((field) => ({ ...field, key: field.key.trim() })) });
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const change = (index: number, patch: Partial<Field>) => setFields(fields.map((field, i) => (i === index ? { ...field, ...patch } : field)));

  return (
    <div className="veil" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="window" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <label className="field">
          <span>Name</span>
          <input autoFocus value={name} placeholder="Place details" onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="pair">
          <label className="field">
            <span>Width</span>
            <div className="combo">
              <select value={widthMode} onChange={(event) => setWidthMode(event.target.value)}>
                <option value="full">Full width</option>
                <option value="max">At most</option>
                <option value="exactly">Exactly</option>
              </select>
              {widthMode !== "full" && <input inputMode="numeric" value={width} onChange={(event) => setWidth(event.target.value.replace(/\D/g, ""))} aria-label="Width in px" />}
              {widthMode !== "full" && <em>px</em>}
            </div>
          </label>
          <label className="field">
            <span>Height</span>
            <div className="combo">
              <select value={heightMode} onChange={(event) => setHeightMode(event.target.value)}>
                <option value="content">Its content</option>
                <option value="max">At most</option>
                <option value="exactly">Exactly</option>
              </select>
              {heightMode !== "content" && <input inputMode="numeric" value={height} onChange={(event) => setHeight(event.target.value.replace(/\D/g, ""))} aria-label="Height in px" />}
              {heightMode !== "content" && <em>px</em>}
            </div>
          </label>
        </div>
        {withFields && (
        <div className="field">
          <span>Data</span>
          <p className="hint">
            What <code>block.self()</code> answers. In an app, each is one of its own values; here, made-up ones. None is required.
          </p>
          <div className="rows">
            {fields.map((field, index) => (
              <div className="row-field" key={index}>
                <input value={field.key} placeholder="name" aria-label="Field" onChange={(event) => change(index, { key: event.target.value.replace(/[^a-zA-Z0-9_]/g, "") })} />
                <select value={field.type} aria-label="Kind" onChange={(event) => change(index, { type: event.target.value })}>
                  {FIELD_TYPES.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
                <button className="text" aria-label="Remove" onClick={() => setFields(fields.filter((_, i) => i !== index))}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <button className="text" onClick={() => setFields([...fields, { key: "", type: "text" }])}>
            + Field
          </button>
        </div>
        )}
        {problem && <p className="pane-problem">{problem}</p>}
        <div className="window-foot">
          <button className="text" onClick={onClose}>
            Cancel
          </button>
          <button className="solid" disabled={busy} onClick={() => void save()}>
            {action}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The draft as the server has it, asked for again each second; a change anyone made is drawn at once. */
function useDraft() {
  const [current, setCurrent] = useState<Draft | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [flash, setFlash] = useState(false);
  const version = useRef<number | null>(null);
  const editing = useRef(false);

  const take = useCallback((draft: Draft) => {
    if (version.current !== null && draft.version !== version.current) {
      setFlash(true);
      setTimeout(() => setFlash(false), 700);
    }
    version.current = draft.version;
    setCurrent(draft);
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      // A tab that is not showing, or a source being typed, is left alone.
      if (!document.hidden && !editing.current) {
        try {
          const draft = await getDraft(version.current ?? undefined);
          if (draft && !stopped && !editing.current) {
            setProblems(draft.problems);
            take(draft);
          }
        } catch {
          // the next tick asks again
        }
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [take]);

  const write = useCallback(
    async (changes: Parameters<typeof writeDraft>[0]) => {
      const { draft, problems } = await writeDraft(changes);
      setProblems(problems);
      take(draft);
    },
    [take],
  );
  const setEditing = useCallback((on: boolean) => {
    editing.current = on;
  }, []);
  return { current, problems, flash, write, setEditing };
}

function DraftName({ draft, onWrite }: { draft: Draft; onWrite: (changes: { name: string | null }) => Promise<void> }) {
  const [name, setName] = useState(draft.name ?? "");
  useEffect(() => {
    setName(draft.name ?? "");
  }, [draft.name]);
  return (
    <input
      className="name"
      aria-label="The layout's name"
      placeholder="Untitled layout"
      value={name}
      onChange={(event) => setName(event.target.value)}
      onBlur={() => name.trim() !== (draft.name ?? "") && void onWrite({ name: name.trim() || null })}
      onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
    />
  );
}

/** Text written by hand (the source, the data): saved a moment after the last key, and drawn like any other write. */
function TextPane({ label, text, onSave, onEditing, check, children }: { label: string; text: string; onSave: (text: string) => Promise<void>; onEditing: (on: boolean) => void; check?: (text: string) => string | null; children?: ReactNode }) {
  const [value, setValue] = useState(text);
  const [problem, setProblem] = useState<string | null>(null);
  const typing = useRef(false);
  const under = useRef<HTMLPreElement>(null);
  const colours = useMemo(() => highlighted(value), [value]);
  useEffect(() => {
    if (!typing.current) setValue(text);
  }, [text]);
  useEffect(() => {
    if (!typing.current) return;
    const later = setTimeout(() => {
      const wrong = check?.(value) ?? null;
      setProblem(wrong);
      if (wrong) return;
      void onSave(value)
        .catch((error: Error) => setProblem(error.message))
        .finally(() => {
          typing.current = false;
          onEditing(false);
        });
    }, 600);
    return () => clearTimeout(later);
  }, [value, onSave, onEditing, check]);
  return (
    <div className="text-pane">
      {children}
      {/* The text is typed in a clear textarea over the same text coloured: one font, one wrap, one scroll. */}
      <div className="code-layer">
        <pre ref={under} className="code-under" aria-hidden>
          {colours}
          {"\n"}
        </pre>
        <textarea
          className="code-edit"
          wrap="off"
          spellCheck={false}
          aria-label={label}
          value={value}
          onScroll={(event) => {
            under.current?.scrollTo(event.currentTarget.scrollLeft, event.currentTarget.scrollTop);
          }}
          onChange={(event) => {
            typing.current = true;
            onEditing(true);
            setValue(event.target.value);
          }}
        />
      </div>
      {problem && <p className="pane-problem">{problem}</p>}
    </div>
  );
}

const checkJson = (text: string) => {
  if (!text.trim()) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? null : "The data is one object: { … }";
  } catch (error) {
    return `Not JSON yet: ${(error as Error).message}`;
  }
};

/** A layout: what it accepts, drawn with standard placeholders nobody writes. A block: its own data, as JSON. */
function DataPane({ draft, onWrite, onEditing }: { draft: Draft; onWrite: (changes: { sample: Record<string, unknown> | null }) => Promise<void>; onEditing: (on: boolean) => void }) {
  const save = useCallback((text: string) => onWrite({ sample: text.trim() ? (JSON.parse(text) as Record<string, unknown>) : null }), [onWrite]);
  if (draft.kind === "layout")
    return (
      <div className="text-pane">
        <div className="asks">
          <p>
            <strong>What this layout accepts.</strong> While it is made it is drawn with standard placeholders, the same for every layout: plain words, a fixed number and date, a short list, a picture as a plain colour. Where it is used, the app fills each one; one it does not have stays empty.
          </p>
          {draft.fields.length ? (
            <dl>
              {draft.fields.map((field) => (
                <div key={field.key}>
                  <dt>{field.key}</dt>
                  <dd>{field.type}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="faint">No data yet: add fields in Room & data, or ask the chat.</p>
          )}
        </div>
      </div>
    );
  return <TextPane key="data" label="The block's data, as JSON" text={draft.sample ? JSON.stringify(draft.sample, null, 2) : ""} onSave={save} onEditing={onEditing} check={checkJson} />;
}

// ---- the chat

function Chat({ ai }: { ai: AiStatus }) {
  const [messages, setMessages] = useState<ChatMessage[]>(keptChat);
  const [pending, setPending] = useState<ChatTurn["pending"]>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [cost, setCost] = useState(0);
  const [model, setModel] = useState<string | null>(null);
  const [text, setText] = useState("");
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => linesOf(busy ? [...messages, { role: "user", content: busy }] : messages), [messages, busy]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lines.length, pending, problem]);

  const turn = async (input: { text?: string; approve?: { callId: string; approved: boolean } }) => {
    abort.current = new AbortController();
    setBusy(input.text ?? "");
    setProblem(null);
    setPending(null);
    try {
      const answer = await chatTurn({ messages, ...input }, abort.current.signal);
      setMessages(answer.messages);
      keepChat(answer.messages);
      setPending(answer.pending);
      setCost((sum) => sum + answer.cost);
      setModel(answer.model);
    } catch (error) {
      if ((error as Error).name !== "AbortError") setProblem((error as Error).message);
      if (input.text) setText(input.text);
    } finally {
      setBusy(null);
      abort.current = null;
    }
  };

  const send = () => {
    const said = text.trim();
    if (!said || busy !== null || pending) return;
    setText("");
    void turn({ text: said });
  };
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  return (
    <div className="chat">
      {cost > 0 && (
        <p className="cost" title={`On ${model ?? ai.model}, billed to your OpenRouter account`}>
          ${cost.toFixed(3)}
        </p>
      )}
      <div className="chat-lines">
        {!lines.length && <p className="chat-hint">Describe the layout, or ask a question. It is drawn on the right while it is written.</p>}
        {lines.map((line, index) => (
          <div key={index} className={`line line--${line.kind}`}>
            {line.kind === "step" && <span aria-hidden>✓ </span>}
            {line.text}
          </div>
        ))}
        {busy !== null && <div className="line line--step thinking">Working…</div>}
        {pending && (
          <div className="approve">
            <p>{pending.summary}</p>
            <div className="row">
              <button onClick={() => void turn({ approve: { callId: pending.callId, approved: true } })}>Approve</button>
              <button className="quiet" onClick={() => void turn({ approve: { callId: pending.callId, approved: false } })}>
                Decline
              </button>
            </div>
          </div>
        )}
        {problem && <div className="line line--error">{problem}</div>}
        <div ref={end} />
      </div>
      <div className="chat-input">
        <textarea
          rows={3}
          placeholder={pending ? "Approve or decline first" : "Describe the layout, or ask a question"}
          value={text}
          disabled={Boolean(pending)}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKey}
        />
        <div className="chat-actions">
          <ModelChip ai={ai} />
          <span className="spacer" />
          {busy !== null ? (
            <button className="quiet" onClick={() => abort.current?.abort()}>
              Stop
            </button>
          ) : (
            <button onClick={send} disabled={!text.trim() || Boolean(pending)}>
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Connect() {
  return (
    <div className="chat connect">
      <h2>Connect your OpenRouter account</h2>
      <p>The chat runs on your own OpenRouter account, with the model you choose, and is billed there. Your key is kept encrypted on this server and never shown again.</p>
      <button onClick={() => void connectAi()}>Connect OpenRouter</button>
    </div>
  );
}

// ---- the model: chosen by the person, never swapped

const priceOf = (model: CatalogModel) => (model.price ? `$${+model.price.input.toFixed(2)} / $${+model.price.output.toFixed(2)} per M` : "");

function ModelChip({ ai }: { ai: AiStatus }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sure, setSure] = useState(false);
  const { data } = useQuery({ queryKey: ["models"], queryFn: getModels, staleTime: 10 * 60 * 1000 });
  const choose = useMutation({
    mutationFn: (model: string | null) => chooseModel(model),
    onSuccess: (status) => {
      client.setQueryData(["ai"], status);
      setOpen(false);
    },
  });
  const disconnect = useMutation({ mutationFn: disconnectAi, onSuccess: () => client.invalidateQueries({ queryKey: ["ai"] }) });

  const label = data?.models.find((model) => model.id === ai.model)?.label ?? ai.model.replace(/^~/, "").split("/").pop();
  const shown = useMemo(() => {
    const words = search.trim().toLowerCase();
    const models = (data?.models ?? []).filter((model) => !words || `${model.label} ${model.maker} ${model.id} ${model.note}`.toLowerCase().includes(words));
    // a model that is gone stays on top, marked, until another is chosen
    const gone: CatalogModel[] = ai.gone ? [{ id: ai.model, label: ai.model, maker: "", note: "No longer available on OpenRouter", latest: false, price: null, available: false }] : [];
    const groups = new Map<string, CatalogModel[]>();
    for (const model of models) groups.set(model.maker, [...(groups.get(model.maker) ?? []), model]);
    return { gone, groups: [...groups] };
  }, [data, search, ai]);

  return (
    <div className="model">
      <button className={`quiet chip${ai.gone ? " chip--gone" : ""}`} onClick={() => setOpen(!open)} title={ai.gone ? `${ai.model} is no longer available on OpenRouter` : ai.model} aria-expanded={open}>
        {label}
      </button>
      {open && (
        <div className="model-list" role="dialog" aria-label="Settings → AI">
          <div className="model-top">
            <strong>Settings → AI</strong>
            <span>key …{ai.key_hint}</span>
            <button className="quiet" onClick={() => (sure ? disconnect.mutate() : setSure(true))} title="The chat stops until it is connected again">
              {sure ? "Sure? Disconnect" : "Disconnect"}
            </button>
          </div>
          <input autoFocus placeholder="Search the models" value={search} onChange={(event) => setSearch(event.target.value)} />
          <div className="model-rows">
            {shown.gone.map((model) => (
              <div key={model.id} className="model-row model-row--gone">
                <span>{model.label}</span>
                <small>{model.note}</small>
              </div>
            ))}
            {!data && <p className="model-wait">Reading the models from OpenRouter…</p>}
            {shown.groups.map(([maker, models]) => (
              <div key={maker}>
                <div className="model-maker">{maker}</div>
                {models.map((model) => (
                  <button key={model.id} className={`model-row${model.id === ai.model ? " model-row--on" : ""}`} onClick={() => choose.mutate(model.id === data?.default_model ? null : model.id)}>
                    <span>{model.label}</span>
                    <small>
                      {model.note}
                      {model.note && priceOf(model) ? " · " : ""}
                      {priceOf(model)}
                    </small>
                  </button>
                ))}
              </div>
            ))}
          </div>
          {choose.error && <p className="error">{choose.error.message}</p>}
        </div>
      )}
    </div>
  );
}

// ---- back from OpenRouter

export function AiCallbackPage() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [problem, setProblem] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    finishConnectAi(new URLSearchParams(location.search)).then(
      (status) => {
        client.setQueryData(["ai"], status);
        void navigate({ to: "/make" });
      },
      (error: Error) => setProblem(error.message),
    );
  }, [navigate, client]);
  return (
    <Shell>
      <main className="welcome">
        {problem ? (
          <>
            <p className="error">{problem}</p>
            <Link to="/make">Back to the chat</Link>
          </>
        ) : (
          <p>Connecting your OpenRouter account…</p>
        )}
      </main>
    </Shell>
  );
}
