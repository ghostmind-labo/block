import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { ensureUser } from "../blocks/store.ts";
import { env } from "../env.ts";
import { sharedUserId } from "./shared-users.ts";

export interface User {
  id: string; // the shared users id (the Google "sub" for people who first signed in with Google)
  email: string;
  name?: string;
}

const cache = new Map<string, { user: User; until: number }>();

/**
 * Validate a Google access token (issued through our /oauth flow or a Google
 * sign-in using our client). Cached for up to 5 minutes, never past expiry.
 */
export async function userFromToken(token: string): Promise<User | null> {
  const key = createHash("sha256").update(token).digest("hex");
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.user;

  const info = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`);
  if (!info.ok) return null;
  const claims = (await info.json()) as { aud?: string; azp?: string; sub?: string; email?: string; email_verified?: string; expires_in?: string };
  if (claims.aud !== env.googleClientId && claims.azp !== env.googleClientId) return null;
  if (!claims.sub || !claims.email) return null;

  const user: User = { id: await sharedUserId({ sub: claims.sub, email: claims.email }), email: claims.email };
  if (!hit) await ensureUser(user);
  // Auth runs on every MCP request (the server is stateless): validated tokens are kept briefly, per pod, successes only.
  const lifetime = Math.min(Number(claims.expires_in ?? 60), 60) * 1000;
  if (cache.size > 5000) cache.clear();
  cache.set(key, { user, until: Date.now() + lifetime });
  return user;
}

/** Express middleware: 401 with the MCP-standard pointer to our OAuth metadata. */
export function requireUser(req: Request, res: Response, next: NextFunction) {
  const token = /^Bearer (.+)$/i.exec(req.headers.authorization ?? "")?.[1];
  const deny = () =>
    res
      .status(401)
      .set("WWW-Authenticate", `Bearer resource_metadata="${env.publicUrl}/.well-known/oauth-protected-resource"`)
      .json({ error: "invalid_token", error_description: "Sign in with Google" });
  if (!token) return deny();
  userFromToken(token)
    .then((user) => {
      if (!user) return deny();
      res.locals.user = user;
      next();
    })
    .catch(next);
}

export const currentUser = (res: Response): User => res.locals.user as User;
