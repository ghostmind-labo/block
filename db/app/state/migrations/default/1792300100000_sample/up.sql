-- The made-up data a block is drawn with while it is written (a draft's), and kept with it once published
-- (a block's): what `block.self()` answers in this app, in place of the real object an app has.
ALTER TABLE drafts ADD COLUMN sample jsonb CHECK (sample IS NULL OR octet_length(sample::text) <= 50000);
ALTER TABLE blocks ADD COLUMN sample jsonb CHECK (sample IS NULL OR octet_length(sample::text) <= 50000);
