-- Gate menu_items.price behind an explicit visibility flag, and expose the
-- catalog to customers only through a SECURITY DEFINER RPC (not a direct
-- table grant) since RLS can hide rows but not columns — the customer
-- portal must never see raw prices before this flag is intentionally
-- flipped for an item.

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS price_visible_to_customers boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION get_active_menu_items()
RETURNS TABLE (
  id uuid,
  name_he text,
  name_en text,
  unit text,
  category text,
  price numeric
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT id, name_he, name_en, unit, category,
         CASE WHEN price_visible_to_customers THEN price ELSE null END AS price
  FROM menu_items
  WHERE active = true
$$;

GRANT EXECUTE ON FUNCTION get_active_menu_items() TO authenticated;
