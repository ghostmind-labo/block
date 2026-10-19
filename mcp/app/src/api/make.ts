import { json, type NextFunction, type Request, type Response, Router } from "express";
import { z } from "zod";
import { offeredModels } from "../ai/models.ts";
import { aiStatus, chooseModel, connect, disconnect } from "../ai/openrouter.ts";
import { currentUser, requireUser } from "../auth/google.ts";
import { chatTurn } from "../drafts/chat.ts";
import { draftProblems, draftVersion, loadDraft, newDraft, readDraft, saveDraft, writeDraft } from "../drafts/store.ts";

/** The block chat's API: the person's OpenRouter account, their live draft, and a turn of the chat. Signed in. */
export const make = Router();

const safely = (handler: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => {
  handler(req, res).catch(next);
};
const invalid = (res: Response, message: string) => res.status(400).json({ error: "invalid", message });

make.use(["/api/ai", "/api/draft", "/api/chat"], requireUser);

// The person's OpenRouter account: whether it is connected, the model the chat runs on, and the models offered.
make.get("/api/ai", safely(async (_req, res) => res.json(await aiStatus(currentUser(res).id))));
make.get("/api/ai/models", safely(async (_req, res) => res.json(await offeredModels())));
make.post(
  "/api/ai/openrouter",
  json(),
  safely(async (req, res) => {
    const body = z.object({ code: z.string().min(1).max(2000), verifier: z.string().min(43).max(128) }).safeParse(req.body);
    if (!body.success) return invalid(res, "the code OpenRouter sent back, and the verifier the page kept");
    return res.json(await connect(currentUser(res).id, body.data.code, body.data.verifier));
  }),
);
make.patch(
  "/api/ai",
  json(),
  safely(async (req, res) => {
    const body = z.object({ model: z.string().max(120).nullable() }).safeParse(req.body);
    if (!body.success) return invalid(res, "a model id, or null for the default");
    return res.json(await chooseModel(currentUser(res).id, body.data.model));
  }),
);
make.delete("/api/ai", safely(async (_req, res) => (await disconnect(currentUser(res).id), res.status(204).end())));

const Side = z.object({ min: z.number().int().optional(), max: z.number().int().optional() }).nullable();
const Room = z.object({ width: Side, height: Side });

// The live draft, with what is seen wrong in it. `?since=12` answers 204 while the version is still 12: what an open page asks each second.
make.get(
  "/api/draft",
  safely(async (req, res) => {
    const since = Number(req.query.since);
    const uid = currentUser(res).id;
    if (Number.isFinite(since) && req.query.since !== undefined && (await draftVersion(uid)) === since) return res.status(204).end();
    const draft = await readDraft(uid);
    return res.json({ ...draft, problems: draftProblems(draft) });
  }),
);
make.patch(
  "/api/draft",
  json({ limit: "1mb" }),
  safely(async (req, res) => {
    const body = z
      .object({
        source: z.string().optional(),
        name: z.string().max(120).nullable().optional(),
        sample: z.record(z.string(), z.unknown()).nullable().optional(),
        room: Room.optional(),
        // one of the person's blocks to start from, or a new empty block (in a room); fresh also throws the draft away
        from: z.string().optional(),
        fresh: z.object({ room: Room.optional(), name: z.string().max(120).nullable().optional() }).optional(),
      })
      .safeParse(req.body);
    if (!body.success) return invalid(res, "source, name, sample, room; or from (a block's id, to start from it); or fresh ({ room, name }, a new empty block)");
    const uid = currentUser(res).id;
    if (body.data.from) return res.json({ draft: await loadDraft(uid, body.data.from), problems: [] });
    if (body.data.fresh) return res.json({ draft: await newDraft(uid, body.data.fresh), problems: [] });
    const { from: _from, fresh: _fresh, ...changes } = body.data;
    return res.json(await writeDraft(uid, changes));
  }),
);
// The page's own Save button: the person pressing it is the approval.
make.post(
  "/api/draft/save",
  json(),
  safely(async (req, res) => {
    const body = z.object({ name: z.string().min(1).max(120).optional(), as_new: z.boolean().optional() }).safeParse(req.body ?? {});
    if (!body.success) return invalid(res, "name, as_new");
    return res.json(await saveDraft(currentUser(res).id, body.data));
  }),
);

// One turn of the chat. The conversation travels with each request; the server keeps nothing of it.
const Message = z.object({
  role: z.enum(["user", "assistant", "tool"]),
  content: z.string().nullable(),
  tool_calls: z.array(z.object({ id: z.string(), type: z.literal("function"), function: z.object({ name: z.string(), arguments: z.string() }) })).optional(),
  tool_call_id: z.string().optional(),
});
make.post(
  "/api/chat",
  json({ limit: "4mb" }),
  safely(async (req, res) => {
    const body = z
      .object({ messages: z.array(Message).max(400), text: z.string().max(8000).optional(), approve: z.object({ callId: z.string(), approved: z.boolean() }).optional() })
      .safeParse(req.body);
    if (!body.success) return invalid(res, "messages, and text or approve");
    const aborted = new AbortController();
    res.on("close", () => !res.writableFinished && aborted.abort());
    return res.json(await chatTurn(currentUser(res).id, body.data, aborted.signal));
  }),
);
