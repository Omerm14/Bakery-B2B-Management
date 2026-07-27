-- Let staff restrict a menu item to a specific subset of customers (e.g.
-- wholesale-only items). Uses an explicit boolean flag rather than "empty
-- join table = unrestricted", because that convention can't represent
-- "restricted, but currently allowed for zero customers" (a valid transient
-- state while staff is unchecking customers one by one in the UI).
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS restrict_customers boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS menu_item_customer_access (
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  customer_id  uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (menu_item_id, customer_id)
);

ALTER TABLE menu_item_customer_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON menu_item_customer_access FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Extend get_active_menu_items() (migrations 024/040/047/048) to hide items
-- restricted away from the calling customer. Staff sessions have no
-- current_customer_id(), but they don't call this RPC, so that's moot here.
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
    AND (
      NOT mi.restrict_customers
      OR EXISTS (
        SELECT 1 FROM menu_item_customer_access a
        WHERE a.menu_item_id = mi.id AND a.customer_id = current_customer_id()
      )
    )
$$;

GRANT EXECUTE ON FUNCTION get_active_menu_items() TO authenticated;
