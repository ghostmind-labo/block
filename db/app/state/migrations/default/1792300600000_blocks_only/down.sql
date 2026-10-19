-- The layouts themselves are not brought back: their html lives on in the blocks made from them.
CREATE TABLE layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  source text NOT NULL DEFAULT '' CHECK (octet_length(source) <= 200000),
  room jsonb,
  fields jsonb,
  sample jsonb CHECK (sample IS NULL OR octet_length(sample::text) <= 50000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX layouts_user_updated ON layouts (user_id, updated_at DESC);
CREATE TRIGGER layouts_updated_at BEFORE UPDATE ON layouts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE blocks ADD COLUMN layout_id uuid REFERENCES layouts(id) ON DELETE SET NULL;
ALTER TABLE drafts ADD COLUMN based_on uuid REFERENCES layouts(id) ON DELETE SET NULL;
ALTER TABLE drafts ADD COLUMN kind text NOT NULL DEFAULT 'block' CHECK (kind IN ('layout', 'block'));
ALTER TABLE drafts ADD COLUMN layout_id uuid REFERENCES layouts(id) ON DELETE SET NULL;
ALTER TABLE drafts ADD COLUMN fields jsonb;
