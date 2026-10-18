-- A layout is not a block (as in Potion): a layout is a preset UI that accepts data (its source, its room, the
-- fields self() answers, and made-up data to draw it with); a block is an html block, made with html of its own
-- or from a layout and its data. Until now both lived in `blocks`.
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

-- What was a layout (a block with fields, made from no other) becomes one, with the same id: the blocks made
-- from it keep pointing at it.
INSERT INTO layouts (id, user_id, name, source, room, fields, sample, created_at, updated_at)
  SELECT id, user_id, name, source, room, fields, sample, created_at, updated_at FROM blocks
  WHERE layout_id IS NULL AND fields IS NOT NULL AND jsonb_array_length(fields) > 0;

ALTER TABLE blocks DROP CONSTRAINT IF EXISTS blocks_layout_id_fkey;
ALTER TABLE drafts DROP CONSTRAINT IF EXISTS drafts_based_on_fkey;
DELETE FROM blocks WHERE id IN (SELECT id FROM layouts);
UPDATE blocks SET layout_id = NULL WHERE layout_id IS NOT NULL AND layout_id NOT IN (SELECT id FROM layouts);
ALTER TABLE blocks ADD CONSTRAINT blocks_layout_id_fkey FOREIGN KEY (layout_id) REFERENCES layouts(id) ON DELETE SET NULL;
-- the live draft is a layout's: what it was started from, and what a publish replaces, is a layout
UPDATE drafts SET based_on = NULL WHERE based_on IS NOT NULL AND based_on NOT IN (SELECT id FROM layouts);
ALTER TABLE drafts ADD CONSTRAINT drafts_based_on_fkey FOREIGN KEY (based_on) REFERENCES layouts(id) ON DELETE SET NULL;
-- a block's data is its sample; the fields it is read with are its layout's
ALTER TABLE blocks DROP COLUMN fields;
