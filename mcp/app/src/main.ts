import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import express, { json, type NextFunction, type Request, type Response } from "express";
import { api } from "./api/routes.ts";
import { currentUser, requireUser, type User } from "./auth/google.ts";
import { oauth } from "./auth/oauth.ts";
import { env } from "./env.ts";
import { registerTools } from "./mcp/tools.ts";

const app = express();
app.set("trust proxy", true);
app.use((req, res, next) => {
  res.set({ "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version", "Access-Control-Expose-Headers": "Mcp-Session-Id, WWW-Authenticate" });
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});
app.use(oauth);
app.use(api);

/**
 * MCP over streamable HTTP, STATELESS, as the 2026-07-28 revision of MCP makes the protocol itself: no session map, a
 * fresh server per request, the caller resolved from the bearer token on every request (`requireUser`, with a short
 * per-pod cache of validated tokens). Dev and prod run 2 replicas behind one Service with nothing pinning a client
 * to a pod, so a session kept in one pod's memory would be unknown to the next request: any pod answers any request,
 * and a restart loses nothing. Anything a tool must remember between calls is in the database.
 *
 * `createMcpHandler` serves both eras from the one factory: 2026-07-28 requests (no `initialize`; version and
 * capabilities in each request's `_meta`) and, statelessly, clients still on the 2025 handshake. No `Mcp-Session-Id` is
 * issued; one a client still sends is ignored. The handler verifies nothing itself: `req.auth`, set below from the
 * authenticated caller, is what the factory receives.
 */
const mcpHandler = createMcpHandler(
  ({ authInfo }) => {
    const server = new McpServer({ name: "block", version: "0.1.0" });
    // The route below refuses a request with no caller, so the user is always there.
    registerTools(server, (authInfo?.extra as { user: User }).user);
    return server;
  },
  { onerror: (error) => console.error("MCP handler error:", error) },
);
// express.json below bounds the body; the adapter only sees the parsed one.
const mcpNodeHandler = toNodeHandler(mcpHandler, { onerror: (error) => console.error("MCP request error:", error) });

app.post("/mcp", requireUser, json({ limit: "4mb" }), async (req, res) => {
  const token = /^Bearer (.+)$/i.exec(req.headers.authorization ?? "")?.[1] ?? "";
  (req as Request & { auth?: unknown }).auth = { token, clientId: "block", scopes: [], extra: { user: currentUser(res) } };
  await mcpNodeHandler(req, res, req.body);
});
app.all("/mcp", (_req, res) => {
  res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
});

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  if (!res.headersSent) res.status(500).json({ error: "internal_error", message: error.message });
});

app.listen(env.port, () => {
  console.log(`block mcp on :${env.port} — ${env.publicUrl}/mcp`);
});
