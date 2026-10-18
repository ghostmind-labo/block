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
import { getBlock, listBlocks } from "../blocks/store.ts";
import { env } from "../env.ts";
import { draftAdvice, loadDraft, publishDraft, publishPlan, readDraft, slotOf, writeDraft } from "./store.ts";

const TOOLS = [
  ...DRAFT_TOOLS,
  {
    name: "load_draft",
    description: "Start the draft from one of the person's layouts: its source, name, room, fields and sample replace the draft's, and a publish then replaces that layout. The draft's current source is lost: ask first when it has work that was not published.",
    parameters: { type: "object", properties: { id: { type: "string", description: "The block's id, from list_blocks" } }, required: ["id"], additionalProperties: false },
  },
  {
    name: "list_blocks",
    description: "The person's blocks, the last changed first: id, name, slot, whether it is shared. Sources are left out; get_block returns one.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_block",
    description: "One of the person's blocks in full, with its source.",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
  },
  {
    name: "list_libraries",
    description: "Without a name: the libraries that were tried in a frame, what each is for and the line to write. With a name (it may carry a version and a file): what was learned about it, or it is brought now to see whether it can be, and the global it arrives as. Any npm package may be named.",
    parameters: { type: "object", properties: { name: { type: "string" } }, additionalProperties: false },
  },
];

/** What a block of this app may ask for: the object it shows. Here, the draft's made-up data. */
export const BLOCK_HOST = selfHost("block");

const ROLE = `You are the layout chat of block (${env.publicUrl}), a playground where layouts are made for the apps that show them (Potion, tags.city, Relay). The person makes ONE layout here, for a room and a set of data they set themselves (below): you write it in their live draft, which is drawn next to this chat, in that room, and drawn again each time you write it. They watch it change.

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
  const now = draft.source.trim()
    ? `THE DRAFT NOW: "${draft.name ?? "untitled"}", ${Buffer.byteLength(draft.source)} bytes${draft.based_on ? `, started from the block "${draft.based_on.name}" (a publish replaces it)` : ", not published"}. read_draft gives its source.`
    : "THE DRAFT NOW: empty. Start it with write_draft: the sample, then the block.";
  return [
    ROLE,
    instructions({
      slots: slot ? [slot] : [],
      host: BLOCK_HOST,
      calls: { self: `the object this layout shows, with the fields ${draft.fields.length ? fieldsText(draft.fields) : "(none set yet: ask the person which data it shows)"}. While it is made: the draft's sample (null until you write one)` },
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
      const block = await publishDraft(userId, { name: text(args.name), as_new: args.as_new === true });
      return { published: true, id: block.id, name: block.name, url: `${env.publicUrl}/b/${block.id}` };
    }
    case "load_draft": {
      const draft = await loadDraft(userId, String(args.id ?? ""));
      return { loaded: true, name: draft.name, version: draft.version };
    }
    case "list_blocks":
      return { blocks: await listBlocks(userId) };
    case "get_block":
      return (await getBlock(userId, String(args.id ?? ""))) ?? { error: "no block of the person's has that id: list_blocks has the ids" };
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
