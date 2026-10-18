-- A person's live draft: the block being written, by the chat, by an agent on the MCP or by the person,
-- and drawn again by the open page each time it changes. One per person. `version` goes up at every
-- write, so a page that asks "still 12?" learns of a change without reading the source again.
-- based_on: the block it was started from, which a publish replaces; deleting that block keeps the draft.
CREATE TABLE drafts (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT '' CHECK (octet_length(source) <= 200000),
  name text CHECK (name IS NULL OR char_length(name) BETWEEN 1 AND 120),
  slot text NOT NULL DEFAULT 'page' CHECK (slot ~ '^[a-z][a-z0-9-]*$'),
  based_on uuid REFERENCES blocks(id) ON DELETE SET NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION drafts_next_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version = OLD.version + 1;
  NEW.updated_at = now();
  RETURN NEW;
END $$;
CREATE TRIGGER drafts_version BEFORE UPDATE ON drafts FOR EACH ROW EXECUTE FUNCTION drafts_next_version();

-- A person's own OpenRouter account: their key, encrypted by the mcp (AES-GCM, AI_KEY_ENCRYPTION_KEY), and the
-- model they chose (NULL: the default). No role but the mcp's admin reads it: the key never leaves the server.
CREATE TABLE ai_connection (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'openrouter' CHECK (provider = 'openrouter'),
  key_ciphertext text NOT NULL,
  key_hint text NOT NULL,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER ai_connection_updated_at BEFORE UPDATE ON ai_connection FOR EACH ROW EXECUTE FUNCTION set_updated_at();
