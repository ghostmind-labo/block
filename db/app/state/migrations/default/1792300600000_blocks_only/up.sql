-- block keeps blocks only (owner, 2026-10-19): no layouts. A block that was made from a layout keeps that layout's
-- html and room as its own; its data (sample) is still what block.self() answers in it.
UPDATE blocks b SET source = l.source, room = COALESCE(l.room, b.room) FROM layouts l WHERE b.layout_id = l.id;
ALTER TABLE blocks DROP COLUMN layout_id;
-- the live draft is always a block: block_id is the one a save replaces
UPDATE drafts SET block_id = NULL WHERE kind = 'layout';
ALTER TABLE drafts DROP COLUMN based_on, DROP COLUMN layout_id, DROP COLUMN kind, DROP COLUMN fields;
DROP TABLE layouts;
