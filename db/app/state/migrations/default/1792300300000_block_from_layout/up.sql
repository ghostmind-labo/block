-- A block made from a layout: the layout is the template (its source, room and fields), the block has its own data
-- (`sample`, what block.self() answers). It is drawn with the layout's source as it is now, so improving a layout
-- improves every block made from it. Its own `source` is the copy taken when it was made: what it keeps if the
-- layout is deleted.
ALTER TABLE blocks ADD COLUMN layout_id uuid REFERENCES blocks(id) ON DELETE SET NULL;
CREATE INDEX blocks_layout ON blocks (layout_id) WHERE layout_id IS NOT NULL;
