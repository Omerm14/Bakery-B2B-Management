-- Customer portal favorites: server-synced (not localStorage) so a
-- customer sees the same favorites across devices. Favorited items get
-- pinned into their own bucket in the customer portal grouping instead of
-- their normal category (see CustomerOrders.jsx / DayOrderView.jsx).
CREATE TABLE customer_favorite_items (
  customer_id  uuid not null references customers(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (customer_id, menu_item_id)
);

ALTER TABLE customer_favorite_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_all" ON customer_favorite_items FOR ALL TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());

CREATE POLICY "customer_select_own" ON customer_favorite_items FOR SELECT TO authenticated
  USING (customer_id = current_customer_id());

CREATE POLICY "customer_insert_own" ON customer_favorite_items FOR INSERT TO authenticated
  WITH CHECK (customer_id = current_customer_id());

CREATE POLICY "customer_delete_own" ON customer_favorite_items FOR DELETE TO authenticated
  USING (customer_id = current_customer_id());

-- Extend get_active_menu_items() (migration 024) with each item's
-- favorite status for the CALLING customer. current_customer_id()
-- resolves off the calling request's JWT regardless of this function's
-- own SECURITY DEFINER context (same mechanism already relied on in
-- log_order_line_audit()) -- returns null for staff sessions, so
-- is_favorite is always false for staff. Postgres won't let CREATE OR
-- REPLACE change a function's RETURNS TABLE shape, even by only adding a
-- column -- must drop first (same reasoning as migrations 037/041).
--
-- This DROP was added retroactively, after 040 had already run in
-- production without it and failed with 42P13 (see migrations 047/048,
-- which exist specifically to patch that forward). This edit only helps a
-- FRESH environment replaying 001->latest from scratch -- it does nothing
-- for any already-migrated environment, which got the real fix from 047/048
-- and must keep them. Do not delete 047/048 because this looks "fixed" now.
DROP FUNCTION IF EXISTS get_active_menu_items();

CREATE OR REPLACE FUNCTION get_active_menu_items()
RETURNS TABLE (
  id uuid,
  name_he text,
  name_en text,
  unit text,
  category text,
  price numeric,
  is_favorite boolean
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT mi.id, mi.name_he, mi.name_en, mi.unit, mi.category,
         CASE WHEN mi.price_visible_to_customers THEN mi.price ELSE null END AS price,
         (cfi.menu_item_id IS NOT NULL) AS is_favorite
  FROM menu_items mi
  LEFT JOIN customer_favorite_items cfi
    ON cfi.menu_item_id = mi.id AND cfi.customer_id = current_customer_id()
  WHERE mi.active = true
$$;

GRANT EXECUTE ON FUNCTION get_active_menu_items() TO authenticated;
