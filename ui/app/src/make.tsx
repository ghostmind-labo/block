import { FIELD_TYPES, publishing, roomSlot, type Slot } from "@ghostmind-dev/block";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { chatTurn, chooseModel, deleteBlock, disconnectAi, updateBlock, getAi, getBlock, getDraft, getModels, listBlocks, publishDraft, writeDraft, type AiStatus, type BlockSummary, type CatalogModel, type ChatMessage, type ChatTurn, type Draft, type Field, type Room } from "./api";
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
  publish_draft: "Published it",
  load_draft: "Opened a layout",
  list_blocks: "Looked at your layouts",
  get_block: "Read a layout",
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
  const { data: ai } = useQuery({ queryKey: ["ai"], queryFn: getAi });
  const { data: layouts } = useQuery({ queryKey: ["blocks"], queryFn: listBlocks });
  const draft = useDraft();
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [settings, setSettings] = useState<"new" | "edit" | null>(null);
  // Another layout is another conversation.
  const [round, setRound] = useState(0);
  const [asking, ask] = useAsk();

  const shown = selected ?? layouts?.[0]?.id ?? null;
  if (!slots || !layouts || !draft.current) return <Shell>{null}</Shell>;
  const current = draft.current;
  const unpublished = Boolean(current.source.trim()) && !current.based_on;

  const startOver = () => {
    keepChat([]);
    setRound((n) => n + 1);
  };
  const edit = async (id: string) => {
    if (current.based_on?.id !== id) {
      if (unpublished && !(await ask(`“${current.name ?? "Untitled layout"}” was not published. Opening another layout replaces it.`, "Open it"))) return;
      await draft.write({ from: id });
      startOver();
    }
    setEditing(true);
  };

  // Editing is the whole window: the chat and the layout, nothing above them.
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
                  setSelected(current.based_on?.id ?? selected);
                }}
              >
                ← Layouts
              </button>
              {ai && (ai.connected ? <Chat key={round} ai={ai} /> : <Connect />)}
            </>
          ) : (
            <LayoutList layouts={layouts} slots={slots.slots} shown={shown} onShow={setSelected} onNew={() => setSettings("new")} draft={current.version > 0 && !current.based_on ? current : null} onDraft={() => setEditing(true)} />
          )}
        </aside>
        <section className="main">
          {editing ? (
            <Workspace draft={draft} slots={slots.slots} ask={ask} onSettings={() => setSettings("edit")} onPublished={() => void client.invalidateQueries({ queryKey: ["blocks"] })} />
          ) : shown ? (
            <LayoutView
              id={shown}
              slots={slots.slots}
              onShow={setSelected}
              onEdit={() => void edit(shown)}
              onDelete={async (name) => {
                if (!(await ask(`Delete “${name}” for good? Its address stops working too.`, "Delete"))) return;
                await deleteBlock(shown);
                setSelected(null);
                await client.invalidateQueries({ queryKey: ["blocks"] });
              }}
            />
          ) : (
            <div className="nothing">
              <p>No layouts yet.</p>
              <button className="solid" onClick={() => setSettings("new")}>
                New layout
              </button>
            </div>
          )}
        </section>
        {settings && (
          <RoomAndData
            title={settings === "new" ? "New layout" : "Room & data"}
            action={settings === "new" ? "Create" : "Save"}
            initial={settings === "new" ? { name: "", room: { width: { max: 480 }, height: null }, fields: [{ key: "name", type: "text" }] } : { name: current.name ?? "", room: roomOf(current, slots.slots), fields: current.fields }}
            onClose={() => setSettings(null)}
            onSave={async ({ name, room, fields }) => {
              if (settings === "new") {
                if (unpublished && !(await ask(`“${current.name ?? "Untitled layout"}” was not published. A new layout replaces it.`, "Start a new one"))) return;
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
        {asking}
      </main>
    </Frame>
  );
}

type Question = { text: string; yes: string; resolve: (ok: boolean) => void };

/** A question asked on the page, never in a browser dialog: `await ask("…", "Publish")` is true on yes. */
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

function LayoutList({ layouts, slots, shown, onShow, onNew, draft, onDraft }: { layouts: BlockSummary[]; slots: Slot[]; shown: string | null; onShow: (id: string) => void; onNew: () => void; draft: Draft | null; onDraft: () => void }) {
  return (
    <nav className="list" aria-label="Your layouts">
      <div className="list-head">
        <h2>Layouts</h2>
        <button className="text" onClick={onNew}>
          New
        </button>
      </div>
      <ul>
        {draft && (
          <li>
            <button onClick={onDraft} title="Not published yet: open it to go on">
              <span>{draft.name ?? "Untitled layout"}</span>
              <small>draft · {roomText(roomOf(draft, slots))}</small>
            </button>
          </li>
        )}
        {layouts
          .filter((layout) => !layout.layout_id)
          .map((layout) => (
            <li key={layout.id}>
              <button aria-current={layout.id === shown} onClick={() => onShow(layout.id)}>
                <span>{layout.name}</span>
                <small>{roomText(roomOf(layout, slots))}</small>
              </button>
            </li>
          ))}
      </ul>
      {layouts.some((layout) => layout.layout_id) && (
        <>
          <div className="list-head list-head--second">
            <h2>Blocks</h2>
          </div>
          <ul>
            {layouts
              .filter((block) => block.layout_id)
              .map((block) => (
                <li key={block.id}>
                  <button aria-current={block.id === shown} onClick={() => onShow(block.id)}>
                    <span>{block.name}</span>
                    <small>from {block.layout?.name ?? "a layout"}</small>
                  </button>
                </li>
              ))}
          </ul>
        </>
      )}
    </nav>
  );
}

/** One layout as it is kept: drawn in its room with its data, and the way into editing it. */
function LayoutView({ id, slots, onEdit, onDelete, onShow }: { id: string; slots: Slot[]; onEdit: () => void; onDelete: (name: string) => Promise<void>; onShow: (id: string) => void }) {
  const { data: layout } = useQuery({ queryKey: ["block", id], queryFn: () => getBlock(id) });
  const [errors, setErrors] = useState<string[]>([]);
  const [embedding, setEmbedding] = useState(false);
  const [size, setSize] = useState<number | null>(null);
  if (!layout) return null;
  const slot = slotFor(layout, slots);
  return (
    <>
      <header className="head">
        <div className="title">
          <h1>{layout.name}</h1>
          {layout.layout ? (
            <p className="meta">
              from{" "}
              <button className="meta meta--button" onClick={() => onShow(layout.layout!.id)}>
                {layout.layout.name}
              </button>{" "}
              · its own data: {Object.keys((layout.sample as object | null) ?? {}).join(", ") || "none"}
            </p>
          ) : (
            <Meta room={roomOf(layout, slots)} fields={layout.fields ?? []} />
          )}
        </div>
        <div className="actions">
          <ShareButton id={layout.id} shared={layout.shared} />
          {layout.shared && (
            <button className="quiet" onClick={() => setEmbedding(true)}>
              Embed
            </button>
          )}
          <button className="icon-only" aria-label="Delete" title="Delete" onClick={() => void onDelete(layout.name)}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
            </svg>
          </button>
          {!layout.layout && (
            <button className="solid" onClick={onEdit}>
              Edit
            </button>
          )}
        </div>
      </header>
      <Stage
        html={layout.source}
        slot={slot}
        scheme={systemScheme()}
        title={layout.name}
        sample={layout.sample}
        onReport={(report) => {
          setErrors(report.errors);
          if (report.size?.height) setSize(report.size.height);
        }}
      />
      <Errors errors={errors} />
      {embedding && layout.shared && <Embed id={layout.id} name={layout.name} width={slot.width?.max ?? null} height={size ?? slot.height?.max ?? 400} onClose={() => setEmbedding(false)} />}
    </>
  );
}

/** Shared: its address is public, and it can be embedded. Not shared: only its owner sees it, and every embed is blank. */
function ShareButton({ id, shared }: { id: string; shared: boolean }) {
  const client = useQueryClient();
  const share = useMutation({
    mutationFn: (on: boolean) => updateBlock(id, { shared: on }),
    onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: ["block", id] }), client.invalidateQueries({ queryKey: ["blocks"] })]),
  });
  return (
    <button
      className={`quiet${shared ? " on" : ""}`}
      disabled={share.isPending}
      title={shared ? "Anyone with its address sees it, and it can be embedded. Click to stop sharing: every embed goes blank" : "Only you see it. Share it to give it a public address and embed it"}
      onClick={() => share.mutate(!shared)}
    >
      {shared ? "Shared" : "Share"}
    </button>
  );
}

/** The code that shows a shared block on another site: an iframe, and a line that makes it follow the block's height. */
function Embed({ id, name, width, height, onClose }: { id: string; name: string; width: number | null; height: number; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => event.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  const src = `${location.origin}/e/${id}`;
  const code = [
    `<iframe src="${src}" title="${name.replace(/"/g, "&quot;")}" loading="lazy" style="display:block;border:0;width:100%;${width ? `max-width:${width}px;` : ""}height:${height}px"></iframe>`,
    `<script>addEventListener("message",e=>{if(e.origin==="${location.origin}"&&e.data&&e.data.type==="block-embed-size")for(const f of document.querySelectorAll('iframe[src="${location.origin}/e/'+e.data.id+'"]'))f.style.height=e.data.height+"px"})</script>`,
  ].join("\n");
  return (
    <div className="veil" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="window" role="dialog" aria-modal="true" aria-label="Embed">
        <h2>Embed</h2>
        <p className="hint">Paste it in any page. The first line shows the block; the second, optional, makes the frame follow its height. It works while the block is shared.</p>
        <pre className="embed-code">{code}</pre>
        <div className="window-foot">
          <button className="text" onClick={onClose}>
            Close
          </button>
          <button
            className="solid"
            onClick={() => {
              void navigator.clipboard.writeText(code).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? "Copied" : "Copy"}
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
function Workspace({ draft, slots, ask, onSettings, onPublished }: { draft: ReturnType<typeof useDraft>; slots: Slot[]; ask: (text: string, yes: string) => Promise<boolean>; onSettings: () => void; onPublished: () => void }) {
  const current = draft.current!;
  const [view, setView] = useState<"preview" | "code" | "data">("preview");
  const [report, setReport] = useState<Report>(NO_REPORT);
  const [status, setStatus] = useState<string | null>(null);
  const publish = useMutation({
    mutationFn: () => publishDraft(),
    onSuccess: (block) => {
      setStatus(`Published as “${block.name}”.`);
      onPublished();
    },
    onError: (error) => setStatus(error.message),
  });
  const slot = slotFor(current, slots);
  const empty = !current.source.trim();
  return (
    <>
      <header className="head">
        <div className="title">
          <DraftName draft={current} onWrite={draft.write} />
          <Meta room={roomOf(current, slots)} fields={current.fields} onClick={onSettings} />
        </div>
        <button className="quiet" onClick={onSettings}>
          Room & data
        </button>
        <button className="solid" disabled={empty || publish.isPending} onClick={() => void ask(publishing(current), "Publish").then((ok) => ok && publish.mutate())}>
          Publish
        </button>
      </header>
      <div className="tabs-line" role="tablist" aria-label="What is shown">
        {(["preview", "code", "data"] as const).map((each) => (
          <button key={each} role="tab" aria-selected={view === each} onClick={() => setView(each)}>
            {each === "preview" ? "Preview" : each === "code" ? "Code" : "Data"}
          </button>
        ))}
        {status && <span className="status">{status}</span>}
      </div>
      <div className={`view live${draft.flash ? " live--flash" : ""}${view !== "preview" ? " view--code" : ""}`}>
        {empty ? (
          <div className="draft-empty">
            <p>Describe the layout in the chat.</p>
          </div>
        ) : (
          <Stage html={current.source} slot={slot} scheme={systemScheme()} title={current.name ?? "The draft"} sample={current.sample} onReport={setReport} />
        )}
        {view === "code" && <TextPane key="code" label="The layout's html" text={current.source} onSave={(source) => draft.write({ source })} onEditing={draft.setEditing} />}
        {view === "data" && <DataPane draft={current} onWrite={draft.write} onEditing={draft.setEditing} />}
      </div>
      <Errors errors={[...draft.problems, ...report.errors]} />
    </>
  );
}

/** A window over the page: the layout's name, its room and the data it shows. */
function RoomAndData({ title, action, initial, onClose, onSave }: { title: string; action: string; initial: { name: string; room: Room; fields: Field[] }; onClose: () => void; onSave: (value: { name: string; room: Room; fields: Field[] }) => Promise<void> }) {
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

/** The made-up data the layout is drawn with: what block.self() answers while it is made. */
function DataPane({ draft, onWrite, onEditing }: { draft: Draft; onWrite: (changes: { sample: Record<string, unknown> | null }) => Promise<void>; onEditing: (on: boolean) => void }) {
  const save = useCallback((text: string) => onWrite({ sample: text.trim() ? (JSON.parse(text) as Record<string, unknown>) : null }), [onWrite]);
  return <TextPane key="data" label="The made-up data, as JSON" text={draft.sample ? JSON.stringify(draft.sample, null, 2) : ""} onSave={save} onEditing={onEditing} check={checkJson} />;
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
