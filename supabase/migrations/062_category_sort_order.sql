-- Let staff choose the order categories appear in (Settings → manage
-- categories). Until now the order was hardcoded in the frontend
-- (src/constants/categories.js CATEGORY_ORDER), so the backfill below seeds
-- sort_order from that same list — nothing moves on deploy — and appends
-- every other category alphabetically after it.
ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;

WITH legacy(name, pos) AS (
  SELECT * FROM unnest(ARRAY['מאפים', 'לחם', 'לחמניות', 'עוגות ועוגיות', 'קפואים ושונות - קונדי'])
    WITH ORDINALITY
),
ranked AS (
  SELECT c.id, row_number() OVER (ORDER BY l.pos NULLS LAST, c.name) AS rn
  FROM categories c
  LEFT JOIN legacy l ON l.name = c.name
)
UPDATE categories c SET sort_order = ranked.rn
FROM ranked WHERE ranked.id = c.id;

-- The customer portal groups items by category too, so customers need to
-- read the order. Category names only — items/prices stay behind
-- get_active_menu_items(). Writes remain staff-only via "staff_all".
CREATE POLICY "authenticated_read" ON categories FOR SELECT TO authenticated
  USING (true);
