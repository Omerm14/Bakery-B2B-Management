-- Categories previously existed only as free text on menu_items.category —
-- a category was never a real row anywhere, so staff had no way to create
-- one ahead of assigning it to an item. This table gives categories their
-- own identity (rename/delete as a group, add one before any item uses it)
-- without touching menu_items.category itself, which stays free text and
-- keeps working exactly as every existing read path (portal grouping,
-- Weekly/Production/Packing, Excel import) already expects.
CREATE TABLE IF NOT EXISTS categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_all" ON categories FOR ALL TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());

-- Backfill from whatever categories are already in use so nothing already
-- assigned to an item disappears from the "known categories" list.
INSERT INTO categories (name)
SELECT DISTINCT category FROM menu_items WHERE category IS NOT NULL AND category <> ''
ON CONFLICT (name) DO NOTHING;
