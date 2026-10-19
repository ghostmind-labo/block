-- The studio makes both, with the same chat and the same live draft: a LAYOUT (a preset UI that accepts data) or a
-- BLOCK (finished content, for the gallery, to share or embed). A block draft may inherit a layout's look and fill
-- its data; `based_on` is the layout a layout draft replaces, `block_id` the block a block draft replaces.
ALTER TABLE drafts ADD COLUMN kind text NOT NULL DEFAULT 'layout' CHECK (kind IN ('layout', 'block'));
ALTER TABLE drafts ADD COLUMN layout_id uuid REFERENCES layouts(id) ON DELETE SET NULL;
ALTER TABLE drafts ADD COLUMN block_id uuid REFERENCES blocks(id) ON DELETE SET NULL;
