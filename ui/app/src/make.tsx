import { saving } from "@ghostmind-dev/block";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { chatTurn, chooseModel, disconnectAi, getAi, getDraft, getModels, saveDraft, writeDraft, type AiStatus, type CatalogModel, type ChatMessage, type ChatTurn, type Draft, type Room } from "./api";
import { signedIn, signIn } from "./auth";
import { NO_REPORT, type Report } from "./frame";
import { connectAi, finishConnectAi } from "./openrouter";
import { highlighted } from "./highlight";
import { roomOf, roomText, slotFor } from "./room";
import { Shell, systemScheme, useSlots } from "./pages";
import { Stage } from "./stage";

// ---- the editor: one block, made or changed with the person's own model. The chat is on the left; the block is on
// the right, drawn again each time anyone writes the live draft (the chat, an agent on the MCP, the Code pane).
// `/make?block=<id>` opens one of the person's blocks in it; `/make?new` starts an empty one.

const POLL_MS = 1000;
const KEPT = "block.chat";

/** What the person sees of a tool the model used. */
const STEPS: Record<string, string> = {
  read_draft: "Read the draft",
  write_draft: "Wrote the draft",
  save_draft: "Saved it",
  load_draft: "Opened a block",
  list_blocks: "Looked at your blocks",
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

export function MakePage() {
  if (!signedIn()) {
    return (
      <Shell>
        <main className="welcome">
          <h1>Make a block</h1>
          <p>Sign in to make blocks with your own model: describe one, and watch it drawn while it is written.</p>
          <button onClick={() => void signIn()}>Sign in with Google</button>
        </main>
      </Shell>
    );
  }
  return <Editor />;
}

function Editor() {
  const slots = useSlots();
  const client = useQueryClient();
  const navigate = useNavigate();
  const { data: ai } = useQuery({ queryKey: ["ai"], queryFn: getAi });
  const draft = useDraft();
  const [sizing, setSizing] = useState(false);
  // Another block is another conversation.
  const [round, setRound] = useState(0);
  const [asking, ask] = useAsk();

  const startOver = () => {
    keepChat([]);
    setRound((n) => n + 1);
  };

  // What the address asks for: one of the person's blocks (`?block=<id>`), or an empty one (`?new`).
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !draft.current) return;
    opened.current = true;
    const asked = new URLSearchParams(location.search);
    const id = asked.get("block");
    const current = draft.current;
    const unsaved = Boolean(current.source.trim()) && !current.based_on;
    void (async () => {
      history.replaceState(null, "", "/make");
      if (id && current.based_on?.id === id) return;
      if (!id && !asked.has("new")) return;
      if (unsaved && !(await ask(`“${current.name ?? "Untitled"}” was not saved. Starting another throws it away.`, "Throw it away"))) return;
      await draft.write(id ? { from: id } : { fresh: {} });
      startOver();
    })();
  }, [draft, ask]);

  if (!slots || !draft.current) return <FullPage>{null}</FullPage>;
  const current = draft.current;

  return (
    <FullPage>
      <main className="editor">
        <aside className="side">
          <Link to="/" className="back">
            ← Gallery
          </Link>
          {ai && (ai.connected ? <Chat key={round} ai={ai} /> : <Connect />)}
        </aside>
        <section className="main">
          <Workspace
            draft={draft}
            ask={ask}
            room={roomOf(current, slots.slots)}
            slot={slotFor(current, slots.slots)}
            onSize={() => setSizing(true)}
            onSaved={(kept) => {
              void client.invalidateQueries({ queryKey: ["blocks"] });
              void client.invalidateQueries({ queryKey: ["block", kept.id] });
            }}
            onOpen={(id) => void navigate({ to: "/b/$id", params: { id } })}
            onDiscard={async () => {
              if (!(await ask(`Throw away “${current.name ?? "Untitled"}”? It was never saved.`, "Throw it away"))) return;
              await draft.write({ fresh: {} });
              startOver();
            }}
          />
        </section>
        {sizing && (
          <SizeWindow
            initial={{ name: current.name ?? "", room: roomOf(current, slots.slots) }}
            onClose={() => setSizing(false)}
            onSave={async ({ name, room }) => {
              await draft.write({ room, name: name || null });
              setSizing(false);
            }}
          />
        )}
        {asking}
      </main>
    </FullPage>
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

/** The grey trash button: throws away what it stands beside, after a question on the page. */
export const Trash = ({ onClick, label = "Delete" }: { onClick: () => void; label?: string }) => (
  <button className="icon-only" aria-label={label} title={label} onClick={onClick}>
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
    </svg>
  </button>
);

const Errors = ({ errors }: { errors: string[] }) =>
  errors.length ? (
    <ul className="problems">
      {errors.map((error, index) => (
        <li key={index}>{error}</li>
      ))}
    </ul>
  ) : null;

/** The block being written: its name and room, and the draft drawn, or its html. */
function Workspace({ draft, ask, room, slot, onSize, onSaved, onOpen, onDiscard }: { draft: ReturnType<typeof useDraft>; ask: (text: string, yes: string) => Promise<boolean>; room: Room; slot: ReturnType<typeof slotFor>; onSize: () => void; onSaved: (kept: { id: string; name: string }) => void; onOpen: (id: string) => void; onDiscard: () => void }) {
  const current = draft.current!;
  const [view, setView] = useState<"preview" | "code">("preview");
  const [report, setReport] = useState<Report>(NO_REPORT);
  const [saved, setSaved] = useState<{ id: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => saveDraft(),
    onSuccess: (kept) => {
      setSaved(kept);
      setProblem(null);
      onSaved(kept);
    },
    onError: (error) => setProblem(error.message),
  });
  const empty = !current.source.trim();
  return (
    <>
      <header className="head">
        <div className="title">
          <DraftName draft={current} onWrite={draft.write} />
          <button className="meta meta--button" onClick={onSize} title="Name and size">
            {roomText(room)}
          </button>
        </div>
        <div className="actions">
          {!current.based_on && !empty && <Trash onClick={onDiscard} label="Throw away the draft" />}
          {saved && current.based_on?.id === saved.id && (
            <button className="quiet" onClick={() => onOpen(saved.id)}>
              Open
            </button>
          )}
          <button className="solid" disabled={empty || save.isPending} onClick={() => void ask(saving({ ...current, kind: "block" }), "Save").then((ok) => ok && save.mutate())}>
            Save
          </button>
        </div>
      </header>
      <div className="tabs-line" role="tablist" aria-label="What is shown">
        {(["preview", "code"] as const).map((each) => (
          <button key={each} role="tab" aria-selected={view === each} onClick={() => setView(each)}>
            {each === "preview" ? "Preview" : "Code"}
          </button>
        ))}
        {problem && <span className="status">{problem}</span>}
      </div>
      <div className={`view live${draft.flash ? " live--flash" : ""}${view !== "preview" ? " view--code" : ""}`}>
        {empty ? (
          <div className="draft-empty">
            <p>Describe a block in the chat.</p>
          </div>
        ) : (
          <Stage html={current.source} slot={slot} scheme={systemScheme()} title={current.name ?? "The draft"} sample={current.sample ?? undefined} onReport={setReport} />
        )}
        {view === "code" && <TextPane key="code" label="The block's html" text={current.source} onSave={(source) => draft.write({ source })} onEditing={draft.setEditing} />}
      </div>
      <Errors errors={[...draft.problems, ...report.errors]} />
    </>
  );
}

/** A window over the page: the block's name and the room it is drawn in. */
function SizeWindow({ initial, onClose, onSave }: { initial: { name: string; room: Room }; onClose: () => void; onSave: (value: { name: string; room: Room }) => Promise<void> }) {
  const [name, setName] = useState(initial.name);
  const mode = (value: Room["width"], none: string) => (!value ? none : value.min && value.min === value.max ? "exactly" : "max");
  const [widthMode, setWidthMode] = useState(mode(initial.room.width, "full"));
  const [width, setWidth] = useState(String(initial.room.width?.max ?? 480));
  const [heightMode, setHeightMode] = useState(mode(initial.room.height, "content"));
  const [height, setHeight] = useState(String(initial.room.height?.max ?? 360));
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
      await onSave({ name: name.trim(), room: { width: sideOf(widthMode, width), height: sideOf(heightMode, height) } });
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="veil" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="window" role="dialog" aria-modal="true" aria-label="Name and size">
        <h2>Name and size</h2>
        <label className="field">
          <span>Name</span>
          <input autoFocus value={name} placeholder="Untitled" onChange={(event) => setName(event.target.value)} />
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
        {problem && <p className="pane-problem">{problem}</p>}
        <div className="window-foot">
          <button className="text" onClick={onClose}>
            Cancel
          </button>
          <button className="solid" disabled={busy} onClick={() => void save()}>
            Save
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
      aria-label="The block's name"
      placeholder="Untitled"
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
        {!lines.length && <p className="chat-hint">Describe a block, or ask for a change. It is drawn on the right while it is written.</p>}
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
          placeholder={pending ? "Approve or decline first" : "Describe a block, or ask for a change"}
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
