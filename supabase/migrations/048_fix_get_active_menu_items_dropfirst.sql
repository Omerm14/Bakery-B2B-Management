-- 047 failed with 42P13 "cannot change return type of existing function" —
-- proof that the live get_active_menu_items() was still migration 024's
-- original 6-column definition (no is_favorite), and CREATE OR REPLACE
-- cannot alter a function's RETURNS TABLE column set in place. Postgres's
-- own hint is to drop it first, which is safe here: it's a plain SQL
-- function called only via RPC from client code, nothing else in the
-- database depends on it.
DROP FUNCTION IF EXISTS get_active_menu_items();

CREATE FUNCTION get_active_menu_items()
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
