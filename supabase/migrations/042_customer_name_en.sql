-- customers had no English name column at all (unlike menu_items, which
-- has had name_he/name_en since the initial schema), so customer names
-- stayed Hebrew-only even with the English language toggle on. Nullable —
-- falls back to the Hebrew `name` until staff set an English name in
-- Settings.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS name_en text;
