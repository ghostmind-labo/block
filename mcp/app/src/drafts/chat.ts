/**
 * The block chat: a conversation with the person's own model, which writes their live draft and answers their
 * questions. Each write_draft is drawn at once on the page that is open (it asks for the draft's version every
 * second), so the block changes while the model is still working. Saving waits for the person's Approve.
 *
 * The loop, the draft tools and the writing rules are the package's (`runTurn`, `DRAFT_TOOLS`, `instructions`),
 * the same any app uses; what is block's own is here: the tools on its blocks, and the system prompt.
 */
import { asFunctions, DRAFT_TOOLS, instructions, runTurn, selfHost, slotText, type Room } from "@ghostmind-dev/block";
import { aiFor, type ChatMessage } from "../ai/openrouter.ts";
import { lookUpLibrary } from "../blocks/check.ts";
import { listBlocks } from "../blocks/store.ts";
import { env } from "../env.ts";
import { draftAdvice, loadDraft, readDraft, saveDraft, savePlan, slotOf, writeDraft } from "./store.ts";

// The package's draft tools, without the data a block of an app reads through self(): here a block is its html.
const OWN = new Set(["source", "name", "room"]);
const draftTools = DRAFT_TOOLS.map((tool) =>
  tool.name === "write_draft"
    ? {
        ...tool,
        description: "Write the draft: any of the whole source (it replaces what is there), its name, its room (width and height). Give only what changes. It is drawn again on the person's screen at each write: a first version at once, then step by step. The answer lists what is seen wrong in the source, and advice on how it fits its room; act on both in the next write.",
        parameters: { ...tool.parameters, properties: Object.fromEntries(Object.entries(tool.parameters.properties as Record<string, unknown>).filter(([key]) => OWN.has(key))) },
      }
    : tool,
);

const TOOLS = [
  ...draftTools,
  {
    name: "load_draft",
    description: "Start the draft from one of the person's blocks: its source, name and room replace the draft's, and a save then replaces that block. The draft's current source is lost: ask first when it has work that was not saved.",
    parameters: { type: "object", properties: { id: { type: "string", description: "The block's id, from list_blocks" } }, required: ["id"], additionalProperties: false },
  },
  {
    name: "list_blocks",
    description: "The person's blocks, the last changed first: id and name.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_libraries",
    description: "Without a name: the libraries that were tried in a frame, what each is for and the line to write. With a name (it may carry a version and a file): what was learned about it, or it is brought now to see whether it can be, and the global it arrives as. Any npm package may be named.",
    parameters: { type: "object", properties: { name: { type: "string" } }, additionalProperties: false },
  },
];

/** What a block of this app may ask for: the data a block keeps apart from its html, when it has any. */
export const BLOCK_HOST = selfHost("block");

const ROLE = `You are the chat of block (${env.publicUrl}), where html blocks are made and tried: a chart, a card, a small page, a widget, a drawing, a game. The person makes or changes ONE block here: you write it in their live draft, which is drawn next to this chat and drawn again each time you write it. They watch it change.

- Write early: a first version at once, then improve it in steps, each one a whole source. Do not paste the source in the chat; the person sees the block, and the Code tab shows it.
- The content is in the html itself: real and specific when the person gave it; ask for what you do not know, never make up a fact about a real place or person.
- Questions are welcome: answer them plainly. Not every message asks for a change.
- Before changing a draft you did not write in this conversation, read it (read_draft): the person or another agent may have changed it.
- write_draft answers with what is seen wrong in the source: fix it in the next write. A block that throws shows its error to the person, not to you; when they say it is blank or broken, ask what the error says.
- save_draft only when the person asks to keep it. It waits for their approval. Saving shares nothing: sharing is the person's, in the gallery.
- Be brief: a sentence or two on what changed, or the answer.`;

/** The system prompt: who the chat is, the rules of a block in its room, and where the draft is now. */
async function system(userId: string) {
  const draft = await readDraft(userId);
  const slot = slotOf(draft);
  const now = draft.source.trim()
    ? `THE DRAFT NOW: "${draft.name ?? "untitled"}", ${Buffer.byteLength(draft.source)} bytes${draft.based_on ? `, opened from the block "${draft.based_on.name}" (a save replaces it)` : ", not saved"}. read_draft gives its source.`
    : "THE DRAFT NOW: empty. Start it with write_draft.";
  return [
    ROLE,
    instructions({
      slots: slot ? [slot] : [],
      ...(draft.sample ? { host: BLOCK_HOST, calls: { self: "the data this block keeps apart from its html" }, sample: draft.sample } : {}),
    }),
    now,
  ].join("\n\n");
}

async function run(userId: string, name: string, args: Record<string, unknown>) {
  const text = (value: unknown) => (typeof value === "string" ? value : undefined);
  switch (name) {
    case "read_draft":
      return readDraft(userId);
    case "write_draft": {
      const room = args.room && typeof args.room === "object" ? (args.room as Room) : undefined;
      const { draft, problems } = await writeDraft(userId, { source: text(args.source), name: text(args.name), room });
      const advice = draftAdvice(draft);
      return { written: true, version: draft.version, name: draft.name, room: slotText(slotOf(draft)), problems: problems.length ? problems : undefined, advice: advice.length ? advice : undefined };
    }
    case "save_draft": {
      const kept = await saveDraft(userId, { name: text(args.name), as_new: args.as_new === true });
      return { saved: true, ...kept, url: `${env.publicUrl}/b/${kept.id}` };
    }
    case "load_draft": {
      const draft = await loadDraft(userId, String(args.id ?? ""));
      return { loaded: true, name: draft.name, version: draft.version };
    }
    case "list_blocks":
      return { blocks: (await listBlocks(userId)).map(({ id, name }) => ({ id, name })) };
    case "list_libraries":
      return lookUpLibrary(text(args.name));
    default:
      throw new Error(`there is no tool ${name}`);
  }
}

export interface ChatInput {
  messages: ChatMessage[];
  text?: string;
  approve?: { callId: string; approved: boolean };
}

/** One turn of the chat, on the person's model. */
export async function chatTurn(userId: string, input: ChatInput, signal?: AbortSignal) {
  const ai = await aiFor(userId);
  const draft = await readDraft(userId);
  const turn = await runTurn({
    converse: ({ messages }: { messages: ChatMessage[] }) => ai.converse({ messages, tools: asFunctions(TOOLS), signal }),
    tools: TOOLS,
    run: (name: string, args: Record<string, unknown>) => run(userId, name, args),
    describe: (name: string, args: Record<string, unknown>) => (name === "save_draft" ? { summary: savePlan(draft, args) } : { summary: `Run ${name}` }),
    system: await system(userId),
    messages: input.messages.slice(-80),
    text: input.text,
    approve: input.approve,
  });
  return { ...turn, model: turn.model ?? ai.model };
}
