import { env } from "../env.ts";

/**
 * The shared users service: one identity per person across Ghostmind products (tags, potion, format, block).
 * At sign-in, find the person by email; the first time anywhere, create them with their Google "sub" as userId
 * (the same rule as tags, potion and format). block then uses that userId as the person's id everywhere.
 * DB_USERS_ENDPOINT comes from Vault: local users in dev, the cluster's users in prod.
 */
const cache = new Map<string, string>();

async function call<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(env.usersEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hasura-admin-secret": env.usersSecret },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (!response.ok || body.errors?.length) throw new Error(`users service: ${body.errors?.[0]?.message ?? response.status}`);
  return body.data as T;
}

export async function sharedUserId(profile: { sub: string; email: string; name?: string }): Promise<string> {
  const email = profile.email.toLowerCase();
  const hit = cache.get(email);
  if (hit) return hit;

  const found = await call<{ users: { userId: string }[] }>(
    `query($email: String!) { users(where: { email: { _eq: $email } }) { userId } }`,
    { email: profile.email },
  );
  let userId = found.users[0]?.userId;
  if (!userId) {
    const name = profile.name ?? profile.email;
    await call(
      `mutation($user: users_insert_input!) { insert_users_one(object: $user) { userId } }`,
      { user: { email: profile.email, givenName: name, familyName: name, userId: profile.sub, role: "user" } },
    );
    userId = profile.sub;
    console.log(`users: created ${profile.email} (${userId})`);
  } else if (userId !== profile.sub) {
    // An account created elsewhere (e.g. Sign in with Apple) owns this email: block follows the shared id.
    console.log(`users: ${profile.email} uses the shared id ${userId}, not its Google id`);
  }
  if (cache.size > 5000) cache.clear();
  cache.set(email, userId);
  return userId;
}
