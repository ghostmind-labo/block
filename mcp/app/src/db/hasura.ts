import { createHmac } from "node:crypto";
import { env } from "../env.ts";

/** Who a query runs as: a signed-in user (their rows only), or the server itself. */
export type As = { userId: string } | "admin";

const TOKEN_TTL_SECONDS = 3600;
const tokens = new Map<string, { token: string; expires: number }>();

/** A Hasura JWT for one user, cached until shortly before it expires. */
export function userToken(userId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const cached = tokens.get(userId);
  if (cached && cached.expires - 60 > now) return cached.token;
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const head = b64({ alg: "HS256", typ: "JWT" });
  const exp = now + TOKEN_TTL_SECONDS;
  const body = b64({
    sub: userId,
    iat: now,
    exp,
    "https://hasura.io/jwt/claims": {
      "x-hasura-default-role": "user",
      "x-hasura-allowed-roles": ["user"],
      "x-hasura-user-id": userId,
    },
  });
  const signature = createHmac("sha256", env.hasuraJwtKey).update(`${head}.${body}`).digest("base64url");
  const token = `${head}.${body}.${signature}`;
  if (tokens.size > 1000) tokens.clear();
  tokens.set(userId, { token, expires: exp });
  return token;
}

export function headersFor(as: As): Record<string, string> {
  return as === "admin"
    ? { "x-hasura-admin-secret": env.hasuraAdminSecret }
    : { authorization: `Bearer ${userToken(as.userId)}` };
}

export class GraphQLError extends Error {}

export async function gql<T>(query: string, variables: Record<string, unknown>, as: As): Promise<T> {
  const response = await fetch(`${env.hasuraEndpoint}/v1/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headersFor(as) },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new GraphQLError(body.errors.map((e) => e.message).join("; "));
  if (!body.data) throw new GraphQLError(`Hasura returned HTTP ${response.status} without data`);
  return body.data;
}
