-- Re-applies get_active_menu_items() exactly as migration 040 defined it.
-- Safe no-op if 040 already landed correctly — this exists only in case an
-- older, favorites-unaware definition of this function is still the one
-- actually live (e.g. 040 was skipped or only partially run), which would
-- explain customer_favorite_items having real rows while the portal never
-- shows any of them: the RPC customers actually call would simply never
-- have selected is_favorite in the first place.
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
