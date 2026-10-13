/**
 * Google sign-in through the block server's OAuth (PKCE, no secret in the
 * browser). Tokens are Google's own; the refresh token keeps you signed in.
 */
// The server is this very host: the dev server, and the tunnel in prod, send /oauth, /api and /mcp to it.
export const API = "";

const STORE = "block.session";
const redirectUri = () => `${location.origin}/callback`;

interface Session {
  access: string;
  refresh?: string;
  expiresAt: number;
}

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const random = () => b64url(crypto.getRandomValues(new Uint8Array(32)));

function load(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "null");
  } catch {
    return null;
  }
}

function save(tokens: { access_token: string; refresh_token?: string; expires_in?: number }, previous?: Session | null) {
  const session: Session = {
    access: tokens.access_token,
    refresh: tokens.refresh_token ?? previous?.refresh,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
  };
  localStorage.setItem(STORE, JSON.stringify(session));
}

export const signedIn = () => load() !== null;

export async function signIn() {
  const verifier = random();
  const state = random();
  sessionStorage.setItem("block.pkce", JSON.stringify({ verifier, state }));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const params = new URLSearchParams({
    response_type: "code",
    client_id: "block-web",
    redirect_uri: redirectUri(),
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope: "openid email profile",
    state,
  });
  location.assign(`${API}/oauth/authorize?${params}`);
}

/** Back from Google: trade the code (plus our PKCE verifier) for tokens. */
export async function finishSignIn(search: URLSearchParams) {
  const pending = JSON.parse(sessionStorage.getItem("block.pkce") ?? "null") as { verifier: string; state: string } | null;
  sessionStorage.removeItem("block.pkce");
  if (search.get("error")) throw new Error(`Google said: ${search.get("error")}`);
  if (!pending || search.get("state") !== pending.state || !search.get("code")) throw new Error("This sign-in link is stale — try again.");
  const response = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: search.get("code")!, code_verifier: pending.verifier, redirect_uri: redirectUri(), client_id: "block-web" }),
  });
  const tokens = await response.json();
  if (!response.ok) throw new Error(tokens.error_description ?? tokens.error ?? "Sign-in failed");
  save(tokens);
}

export function signOut() {
  localStorage.removeItem(STORE);
  location.assign("/");
}

/** A valid access token, refreshed when it's about to expire. */
export async function accessToken(force = false): Promise<string> {
  const session = load();
  if (!session) throw new SignedOut();
  if (!force && session.expiresAt - Date.now() > 60_000) return session.access;
  if (!session.refresh) throw new SignedOut();
  const response = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: session.refresh }),
  });
  if (!response.ok) {
    localStorage.removeItem(STORE);
    throw new SignedOut();
  }
  save(await response.json(), session);
  return load()!.access;
}

export class SignedOut extends Error {
  constructor() {
    super("signed out");
  }
}
