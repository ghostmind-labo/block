import { describe, slotText } from "@ghostmind-dev/block";
import { json, type NextFunction, type Request, type Response, Router } from "express";
import { z } from "zod";
import { currentUser, requireUser, userFromToken } from "../auth/google.ts";
import { sourceProblem } from "../blocks/check.ts";
import { DEFAULT_SLOT, SLOT_NAMES, SLOTS } from "../blocks/slots.ts";
import { relayPicture, PictureError } from "@ghostmind-dev/block/server";
import { createBlock, deleteBlock, getBlock, getSharedBlock, listBlocks, sharedPicture, updateBlock } from "../blocks/store.ts";

/** The API the web app uses. Same Google sign-in as the MCP. */
export const api = Router();

const safely = (handler: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => {
  handler(req, res).catch(next);
};
const missing = (res: Response) => res.status(404).json({ error: "not_found", message: "There is no block at this address, or it is not shared." });

// What needs no sign-in: the slots and the libraries (the same for everyone), and a block its owner shared.
api.get("/api/slots", (_req, res) => {
  res.json({ default: DEFAULT_SLOT, slots: SLOTS.map((slot) => ({ ...slot, room: slotText(slot) })) });
});
api.get("/api/libraries", (_req, res) => {
  res.json(describe());
});

/** A block by its address: its owner's, or anyone's when it is shared. */
api.get(
  "/api/blocks/:id",
  safely(async (req, res) => {
    const token = /^Bearer (.+)$/i.exec(req.headers.authorization ?? "")?.[1];
    const user = token ? await userFromToken(token) : null;
    const id = String(req.params.id);
    const own = user ? await getBlock(user.id, id) : null;
    if (own) return res.json({ ...own, mine: true });
    const shared = await getSharedBlock(id);
    return shared ? res.json({ ...shared, shared: true, mine: false }) : missing(res);
  }),
);

// A picture a block shows by address, for a page whose browser was refused by the picture's host (no CORS). Signed
// in: any picture. Anyone else: only one a shared block shows, so this is no open relay. Nothing is kept here; the
// browser keeps it a day.
api.get(
  "/api/picture",
  safely(async (req, res) => {
    const address = String(req.query.url ?? "");
    const token = /^Bearer (.+)$/i.exec(req.headers.authorization ?? "")?.[1];
    const user = token ? await userFromToken(token) : null;
    if (!user && !(address && (await sharedPicture(address)))) return res.status(403).json({ error: "forbidden", message: "Sign in to see this picture" });
    try {
      const { type, bytes } = await relayPicture(address);
      res.set({ "content-type": type, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" });
      return res.send(Buffer.from(bytes));
    } catch (error) {
      if (error instanceof PictureError) return res.status(error.status).json({ error: "picture", message: error.message });
      throw error;
    }
  }),
);

api.use("/api", requireUser);

api.get("/api/me", (_req, res) => {
  res.json(currentUser(res));
});

api.get(
  "/api/blocks",
  safely(async (_req, res) => res.json({ blocks: await listBlocks(currentUser(res).id) })),
);

const Changes = z.object({
  name: z.string().min(1).max(120).optional(),
  source: z.string().min(1).optional(),
  slot: z.enum(SLOT_NAMES).optional(),
  shared: z.boolean().optional(),
});

api.post(
  "/api/blocks",
  json({ limit: "1mb" }),
  safely(async (req, res) => {
    const body = Changes.required({ name: true, source: true }).safeParse(req.body);
    const problem = body.success ? sourceProblem(body.data.source) : "a block has a name and a source";
    if (!body.success || problem) return res.status(400).json({ error: "invalid", message: problem });
    return res.status(201).json(await createBlock(currentUser(res).id, { name: body.data.name, source: body.data.source, slot: body.data.slot ?? DEFAULT_SLOT, shared: body.data.shared ?? false }));
  }),
);

api.patch(
  "/api/blocks/:id",
  json({ limit: "1mb" }),
  safely(async (req, res) => {
    const body = Changes.safeParse(req.body);
    const problem = body.success && body.data.source !== undefined ? sourceProblem(body.data.source) : body.success ? null : "name, source, slot or shared";
    if (!body.success || problem) return res.status(400).json({ error: "invalid", message: problem });
    const block = await updateBlock(currentUser(res).id, String(req.params.id), body.data);
    return block ? res.json(block) : missing(res);
  }),
);

api.delete(
  "/api/blocks/:id",
  safely(async (req, res) => ((await deleteBlock(currentUser(res).id, String(req.params.id))) ? res.status(204).end() : missing(res))),
);
