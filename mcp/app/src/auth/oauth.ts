import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Router, urlencoded, json } from "express";
import { ensureUser } from "../blocks/store.ts";
import { sharedUserId } from "./shared-users.ts";
import { env } from "../env.ts";

/**
 * OAuth 2.1 for MCP clients (Claude) and the web app, with Google as the identity
 * provider. Tokens are Google's own: we only sign the state and pass the PKCE
 * challenge through, so Google itself verifies the code_verifier.
 */
export const oauth = Router();

const GOOGLE_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const STATE_MAX_AGE_MS = 15 * 60 * 1000;

const callbackUrl = () => `${env.publicUrl}/oauth/callback`;

/** Loopback (Claude Code, the web app in dev), or an allow-listed prefix (claude.ai, …). */
export function redirectAllowed(uri: string, allow = env.redirectAllow): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) return true;
  if (url.protocol !== "https:") return false;
  return allow.some((prefix) => uri.startsWith(prefix));
}

export function signState(payload: object, secret = env.stateSecret): string {
  const body = Buffer.from(JSON.stringify({ ...payload, at: Date.now() })).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function readState<T>(state: string, secret = env.stateSecret): T | null {
  const [body, mac] = state.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { at: number };
  if (Date.now() - payload.at > STATE_MAX_AGE_MS) return null;
  return payload;
}

oauth.get(["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"], (_req, res) => {
  res.json({ resource: `${env.publicUrl}/mcp`, authorization_servers: [env.publicUrl], scopes_supported: ["openid", "email", "profile"] });
});

oauth.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.json({
    issuer: env.publicUrl,
    authorization_endpoint: `${env.publicUrl}/oauth/authorize`,
    token_endpoint: `${env.publicUrl}/oauth/token`,
    registration_endpoint: `${env.publicUrl}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["openid", "email", "profile"],
  });
});

/** Dynamic client registration. Stateless: what matters is checked at /authorize. */
oauth.post("/oauth/register", json(), (req, res) => {
  const redirectUris: string[] = Array.isArray(req.body?.redirect_uris) ? req.body.redirect_uris : [];
  const refused = redirectUris.filter((uri) => !redirectAllowed(uri));
  if (!redirectUris.length || refused.length) {
    res.status(400).json({ error: "invalid_redirect_uri", error_description: `not allowed: ${refused.join(", ") || "(none given)"}` });
    return;
  }
  res.status(201).json({
    client_id: `block-${randomUUID()}`,
    client_name: req.body?.client_name,
    redirect_uris: redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  });
});

oauth.get("/oauth/authorize", (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  if (!q.redirect_uri || !redirectAllowed(q.redirect_uri)) {
    res.status(400).send("redirect_uri is missing or not allowed");
    return;
  }
  if (!q.code_challenge || (q.code_challenge_method ?? "plain") !== "S256") {
    res.status(400).send("PKCE (code_challenge with S256) is required");
    return;
  }
  const google = new URL(GOOGLE_AUTHORIZE);
  google.search = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: callbackUrl(),
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    code_challenge: q.code_challenge,
    code_challenge_method: "S256",
    state: signState({ redirect: q.redirect_uri, state: q.state ?? "" }),
  }).toString();
  res.redirect(google.toString());
});

oauth.get("/oauth/callback", (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const state = q.state ? readState<{ redirect: string; state: string }>(q.state) : null;
  if (!state || !redirectAllowed(state.redirect)) {
    res.status(400).send("Sign-in expired or was tampered with — start again.");
    return;
  }
  const back = new URL(state.redirect);
  if (q.error) back.searchParams.set("error", q.error);
  if (q.code) back.searchParams.set("code", q.code);
  if (state.state) back.searchParams.set("state", state.state);
  res.redirect(back.toString());
});

oauth.post("/oauth/token", urlencoded({ extended: false }), json(), async (req, res) => {
  const body = req.body as Record<string, string | undefined>;
  const params = new URLSearchParams({ client_id: env.googleClientId, client_secret: env.googleClientSecret });
  if (body.grant_type === "authorization_code") {
    if (!body.code || !body.code_verifier) {
      res.status(400).json({ error: "invalid_request", error_description: "code and code_verifier are required" });
      return;
    }
    params.set("grant_type", "authorization_code");
    params.set("code", body.code);
    params.set("code_verifier", body.code_verifier);
    params.set("redirect_uri", callbackUrl());
  } else if (body.grant_type === "refresh_token" && body.refresh_token) {
    params.set("grant_type", "refresh_token");
    params.set("refresh_token", body.refresh_token);
  } else {
    res.status(400).json({ error: "unsupported_grant_type" });
    return;
  }

  const response = await fetch(GOOGLE_TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: params });
  const tokens = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    res.status(response.status).json(tokens);
    return;
  }
  if (typeof tokens.id_token === "string") {
    // Straight from Google over TLS, so the payload can be read without re-verifying.
    const claims = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString()) as { sub: string; email: string; name?: string; picture?: string };
    const id = await sharedUserId({ sub: claims.sub, email: claims.email, name: claims.name });
    await ensureUser({ id, email: claims.email, name: claims.name, picture: claims.picture });
  }
  res.set("Cache-Control", "no-store").json(tokens);
});
