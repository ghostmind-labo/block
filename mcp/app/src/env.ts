/** Everything comes from varlock (see ../.env.schema); nothing is read from files here. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — start through varlock (run routine dev)`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3105),
  publicUrl: required("PUBLIC_URL").replace(/\/$/, ""),
  redirectAllow: (process.env.OAUTH_REDIRECT_ALLOW ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  hasuraEndpoint: required("HASURA_GRAPHQL_ENDPOINT").replace(/\/$/, ""),
  hasuraAdminSecret: required("HASURA_GRAPHQL_ADMIN_SECRET"),
  hasuraJwtKey: jwtKey(required("HASURA_GRAPHQL_JWT_SECRET")),
  googleClientId: required("GOOGLE_OAUTH_CLIENT_ID"),
  googleClientSecret: required("GOOGLE_OAUTH_CLIENT_SECRET"),
  stateSecret: required("OAUTH_STATE_SECRET"),
  // the shared users service (auth/shared-users.ts)
  usersEndpoint: required("DB_USERS_ENDPOINT"),
  usersSecret: required("DB_USERS_SECRET"),
};

/** Hasura's JWT secret is a JSON blob {"type":"HS256","key":"..."}. */
function jwtKey(raw: string): string {
  try {
    return (JSON.parse(raw) as { key: string }).key;
  } catch {
    return raw;
  }
}
