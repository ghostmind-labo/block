/**
 * The layout chat: a conversation with the person's own model, which writes their live draft and answers their
 * questions. Each write_draft is drawn at once on the page that is open (it asks for the draft's version every
 * second), so the block changes while the model is still working. Publishing waits for the person's Approve.
 *
 * The loop, the draft tools and the writing rules are the package's (`runTurn`, `DRAFT_TOOLS`, `instructions`),
 * the same any app uses; what is block's own is here: the tools on its blocks, and the system prompt.
 */
import { asFunctions, DRAFT_TOOLS, fieldsText, instructions, runTurn, selfHost, slotText, type Field, type Room } from "@ghostmind-dev/block";
import { aiFor, type ChatMessage } from "../ai/openrouter.ts";
import { lookUpLibrary } from "../blocks/check.ts";
import { findLayout, listLayouts } from "../layouts/store.ts";
import { env } from "../env.ts";
import { draftAdvice, loadDraft, publishDraft, publishPlan, readDraft, slotOf, writeDraft } from "./store.ts";

const TOOLS = [
  ...DRAFT_TOOLS,
  {
    name: "load_draft",
    description: "Start the draft from one of the person's layouts: its source, name, room, fields and sample replace the draft's, and a publish then replaces that layout. The draft's current source is lost: ask first when it has work that was not published.",
    parameters: { type: "object", properties: { id: { type: "string", description: "The layout's id or name, from list_layouts" } }, required: ["id"], additionalProperties: false },
  },
  {
    name: "list_layouts",
    description: "The person's layouts (preset UIs that accept data), the last changed first: id, name, fields. get_layout returns one in full.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_layout",
    description: "One of the person's layouts in full, with its source, fields and sample.",
    parameters: { type: "object", properties: { id: { type: "string", description: "Its id or name" } }, required: ["id"], additionalProperties: false },
  },
  {
    name: "list_libraries",
    description: "Without a name: the libraries that were tried in a frame, what each is for and the line to write. With a name (it may carry a version and a file): what was learned about it, or it is brought now to see whether it can be, and the global it arrives as. Any npm package may be named.",
    parameters: { type: "object", properties: { name: { type: "string" } }, additionalProperties: false },
  },
];

/** What a block of this app may ask for: the object it shows. Here, the draft's made-up data. */
export const BLOCK_HOST = selfHost("block");

const ROLE = `You are the layout chat of block (${env.publicUrl}), a playground where layouts are made for the apps that show them (Potion, tags.city, Relay). A layout is a preset UI that accepts data, not a block. The person makes ONE layout or ONE block here (below), for a room and data they set themselves: you write it in their live draft, which is drawn next to this chat, in that room, and drawn again each time you write it. They watch it change.

- The layout shows one object, which it gets with \`await block.self()\`: never written into the source. Its fields are the person's (below); in an app, each is one of the app's own values (potion.self().name). Read only those fields. While it is made, self() answers the draft's sample: made-up data you write with write_draft (sample), with exactly those fields, realistic and specific (real-sounding names, dates, numbers), never lorem ipsum. Write the sample first, then the layout that reads it. Nothing is required: a field that is missing is simply not drawn.
- Everything is yours to change when the person asks: the look, the fields (what self() answers, with their kinds), the room (width and height), the sample. write_draft takes any of them; give the fields and the sample together when the fields change, so the sample keeps exactly the fields.
- Write early: a first version at once, then improve it in steps, each one a whole source. Do not paste the source in the chat; the person sees the block, and the Code tab shows it.
- Questions are welcome: answer them plainly. Not every message asks for a change.
- Before changing a draft you did not write in this conversation, read it (read_draft): the person or another agent may have changed it.
- write_draft answers with what is seen wrong in the source: fix it in the next write. A block that throws shows its error to the person, not to you; when they say it is blank or broken, ask what the error says.
- publish_draft only when the person asks to keep it. It waits for their approval.
- Be brief: a sentence or two on what changed, or the answer.`;

/** The system prompt: who the chat is, the rules of a block in its one place, and where the draft is now. */
async function system(userId: string) {
  const draft = await readDraft(userId);
  const slot = slotOf(draft);
  const what = draft.kind === "block" ? "block" : "layout";
  const now = draft.source.trim()
    ? `THE DRAFT NOW: a ${what}, "${draft.name ?? "untitled"}", ${Buffer.byteLength(draft.source)} bytes${draft.based_on ? `, started from the ${what} "${draft.based_on.name}" (a publish replaces it)` : ", not published"}. read_draft gives its source.`
    : `THE DRAFT NOW: an empty ${what}. Start it with write_draft: the sample, then the source.`;
  const kind =
    draft.kind === "block"
      ? draft.layout
        ? `YOU ARE MAKING A BLOCK from the layout "${draft.layout.name}": finished content for the gallery, to share or embed. Its look is the layout's: what you write is its DATA (write_draft sample), real and specific (the person's own values; ask for what you do not know, never make up a fact about a real place or person). When the person asks to change its look, say first that the block then stops following the layout, then write its source.`
        : "YOU ARE MAKING A BLOCK: finished content for the gallery, to share or embed, with html of its own. Its data is in its sample and read with block.self(), like a layout's; it is the content itself, so make it real and specific. Its fields are what you put in the sample."
      : "YOU ARE MAKING A LAYOUT: a mold, a preset UI that accepts data, never shown on its own. It knows nothing of any real data: you have no access to the app's data or tools, only the draft, and every value it is drawn with is made up (the sample). It declares what it accepts (its fields) and reads each with self(); real data reaches it only later, when a block or an app fills it. Keep every value in self(), none in the source.";
  return [
    ROLE,
    kind,
    instructions({
      slots: slot ? [slot] : [],
      host: BLOCK_HOST,
      calls: { self: `the object this ${what} shows, with the fields ${draft.fields.length ? fieldsText(draft.fields) : "(none set yet: ask the person which data it shows)"}. While it is made: the draft's sample (null until you write one)` },
      sample: draft.sample ?? undefined,
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
      const object = (value: unknown) => (value && typeof value === "object" ? value : undefined);
      const { draft, problems } = await writeDraft(userId, {
        source: text(args.source),
        name: text(args.name),
        sample: object(args.sample),
        room: object(args.room) as Room | undefined,
        fields: Array.isArray(args.fields) ? (args.fields as Field[]) : undefined,
      });
      const advice = draftAdvice(draft);
      return { written: true, version: draft.version, name: draft.name, room: slotText(slotOf(draft)), fields: fieldsText(draft.fields), problems: problems.length ? problems : undefined, advice: advice.length ? advice : undefined };
    }
    case "publish_draft": {
      const kept = await publishDraft(userId, { name: text(args.name), as_new: args.as_new === true });
      return { published: true, ...kept, ...(kept.kind === "block" ? { url: `${env.publicUrl}/b/${kept.id}` } : {}) };
    }
    case "load_draft": {
      const draft = await loadDraft(userId, String(args.id ?? ""));
      return { loaded: true, name: draft.name, version: draft.version };
    }
    case "list_layouts":
      return { layouts: await listLayouts(userId) };
    case "get_layout":
      return (await findLayout(userId, String(args.id ?? ""))) ?? { error: "no layout of the person's by that id or name: list_layouts has them" };
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
    describe: (name: string, args: Record<string, unknown>) => (name === "publish_draft" ? { summary: publishPlan(draft, args) } : { summary: `Run ${name}` }),
    system: await system(userId),
    messages: input.messages.slice(-80),
    text: input.text,
    approve: input.approve,
  });
  return { ...turn, model: turn.model ?? ai.model };
}
