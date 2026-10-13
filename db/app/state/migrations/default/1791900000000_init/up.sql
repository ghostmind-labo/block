CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- A person, keyed by their id in the shared users service (their Google account id, "sub", for people who
-- first signed in with Google): the same key the rest of the ecosystem uses. Made at sign-in by the mcp.
CREATE TABLE users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text,
  picture text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- An html block a person keeps: its source as text, and the slot of the page it is written for.
-- shared = anyone holding its id may read it (role public), never whose it is.
CREATE TABLE blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  source text NOT NULL CHECK (octet_length(source) <= 200000),
  slot text NOT NULL DEFAULT 'page' CHECK (slot ~ '^[a-z][a-z0-9-]*$'),
  shared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX blocks_user_updated ON blocks (user_id, updated_at DESC);

CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER blocks_updated_at BEFORE UPDATE ON blocks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
