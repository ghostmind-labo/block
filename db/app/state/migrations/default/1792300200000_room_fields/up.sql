-- A layout's room and data, set by the person rather than taken from a slot: block is the playground where a
-- layout is made for any place an app may have.
--   room:   {"width": {"min": 320, "max": 320} | {"max": 720} | null, "height": {"max": 360} | {"min": 200, "max": 200} | null}
--           null width: as wide as its place; null height: as tall as its content.
--   fields: [{"key": "name", "type": "text"}, …]: what `self()` answers, none of it required. In an app, each one
--           is a value of the app's own (potion.self().name); here the sample stands in for them.
ALTER TABLE drafts ADD COLUMN room jsonb, ADD COLUMN fields jsonb;
ALTER TABLE blocks ADD COLUMN room jsonb, ADD COLUMN fields jsonb;
