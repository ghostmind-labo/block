ALTER TABLE blocks ADD COLUMN fields jsonb;
ALTER TABLE drafts DROP CONSTRAINT drafts_based_on_fkey;
ALTER TABLE blocks DROP CONSTRAINT blocks_layout_id_fkey;
INSERT INTO blocks (id, user_id, name, source, slot, room, fields, sample, created_at, updated_at)
  SELECT id, user_id, name, source, 'layout', room, fields, sample, created_at, updated_at FROM layouts;
ALTER TABLE blocks ADD CONSTRAINT blocks_layout_id_fkey FOREIGN KEY (layout_id) REFERENCES blocks(id) ON DELETE SET NULL;
ALTER TABLE drafts ADD CONSTRAINT drafts_based_on_fkey FOREIGN KEY (based_on) REFERENCES blocks(id) ON DELETE SET NULL;
DROP TABLE layouts;
