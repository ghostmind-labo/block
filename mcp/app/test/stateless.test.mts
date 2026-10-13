import { test } from "node:test";
import assert from "node:assert/strict";

// The MCP is stateless: both protocol eras answer with no session, against the real tool set, in process (no database).
Object.assign(process.env, {
  PUBLIC_URL: "https://block.example",
  OAUTH_REDIRECT_ALLOW: "https://claude.ai/,https://claude.com/",
  HASURA_GRAPHQL_ENDPOINT: "http://localhost:0",
  HASURA_GRAPHQL_ADMIN_SECRET: "x",
  HASURA_GRAPHQL_JWT_SECRET: '{"type":"HS256","key":"k"}',
  GOOGLE_OAUTH_CLIENT_ID: "id.apps.googleusercontent.com",
  GOOGLE_OAUTH_CLIENT_SECRET: "s",
  OAUTH_STATE_SECRET: "state-secret",
  DB_USERS_ENDPOINT: "http://users.invalid/v1/graphql",
  DB_USERS_SECRET: "test",
});
const { createMcpHandler, McpServer } = await import("@modelcontextprotocol/server");
const { registerTools } = await import("../src/mcp/tools.ts");
const { redirectAllowed, signState, readState } = await import("../src/auth/oauth.ts");
const { sourceProblem } = await import("../src/blocks/check.ts");

const handler = createMcpHandler(({ authInfo }) => {
  const server = new McpServer({ name: "block", version: "0.1.0" });
  registerTools(server, (authInfo?.extra as { user: { id: string; email: string } }).user);
  return server;
});
const auth = { authInfo: { token: "t", clientId: "block", scopes: [], extra: { user: { id: "u", email: "e@example.com" } } } };
const post = async (body: unknown, headers: Record<string, string> = {}) => {
  const res = await handler.fetch(
    new Request("http://x/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify(body) }),
    auth as never,
  );
  return { status: res.status, sid: res.headers.get("mcp-session-id"), text: await res.text() };
};
const tools = (text: string) => (text.match(/"name":/g) ?? []).length;

test("a 2025-era client with no initialize and a session id no pod ever issued still gets the tools, and no session back", async () => {
  const r = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { "mcp-session-id": "never-issued", "mcp-protocol-version": "2025-11-25" });
  assert.equal(r.status, 200, r.text.slice(0, 200));
  assert.equal(r.sid, null);
  assert.ok(tools(r.text) >= 7, `tools: ${tools(r.text)}`);
  assert.match(r.text, /create_block/);
});

test("a 2026-07-28 request (no handshake, version in _meta) gets the same tools", async () => {
  const meta = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {}, "io.modelcontextprotocol/clientInfo": { name: "t", version: "1" } };
  const r = await post({ jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: meta } }, { "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/list" });
  assert.equal(r.status, 200, r.text.slice(0, 200));
  assert.ok(tools(r.text) >= 7, `tools: ${tools(r.text)}`);
});

test("nothing to keep between requests: a GET (the old session stream) is refused", async () => {
  const res = await handler.fetch(new Request("http://x/mcp", { method: "GET", headers: { accept: "text/event-stream" } }), auth as never);
  assert.notEqual(res.status, 200);
});

test("list_slots says each slot's room, with the numbers the web app enforces", async () => {
  const r = await post({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_slots", arguments: {} } }, { "mcp-protocol-version": "2025-11-25" });
  assert.match(r.text, /at most 320 px wide/);
  assert.match(r.text, /hover/);
});

test("sign-in sends people back only where it may, and its state cannot be forged", () => {
  assert.ok(redirectAllowed("http://localhost:5106/callback"));
  assert.ok(redirectAllowed("https://claude.ai/api/mcp/auth_callback"));
  assert.ok(!redirectAllowed("https://evil.example/callback"));
  assert.ok(!redirectAllowed("http://evil.example/callback"));
  const state = signState({ redirect: "http://localhost:1/cb" });
  assert.equal(readState<{ redirect: string }>(state)?.redirect, "http://localhost:1/cb");
  assert.equal(readState(`${state.split(".")[0]}x.${state.split(".")[1]}`), null);
});

test("a source that cannot be kept is refused with the reason", () => {
  assert.equal(sourceProblem("<p>hi</p>"), null);
  assert.match(sourceProblem("```html\n<p>hi</p>\n```")!, /fence/);
  assert.match(sourceProblem("x".repeat(200_001))!, /200000 at most/);
});
