import { connectOpenRouter } from "./api";
import { b64url, random } from "./auth";

// Connecting the person's own OpenRouter account (PKCE): the verifier stays in this tab, OpenRouter sends the
// person back to /ai/callback with a code, and the server trades both for their key, which only it keeps.
const KEPT = "block.openrouter";

export async function connectAi() {
  const verifier = random();
  try {
    sessionStorage.setItem(KEPT, verifier);
  } catch {
    // a tab that keeps nothing cannot finish the connection: OpenRouter's page will say so on return
  }
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const params = new URLSearchParams({ callback_url: `${location.origin}/ai/callback`, code_challenge: challenge, code_challenge_method: "S256" });
  location.assign(`https://openrouter.ai/auth?${params}`);
}

export async function finishConnectAi(search: URLSearchParams) {
  let verifier: string | null = null;
  try {
    verifier = sessionStorage.getItem(KEPT);
    sessionStorage.removeItem(KEPT);
  } catch {
    verifier = null;
  }
  const code = search.get("code");
  if (!code || !verifier) throw new Error("This link from OpenRouter is stale: connect again.");
  return connectOpenRouter(code, verifier);
}
