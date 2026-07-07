-- Adds mi.name_en to week_item_day_totals so Weekly.jsx can offer an
-- English-language print view without a second round-trip per item.
-- Postgres won't let CREATE OR REPLACE change a function's RETURNS TABLE
-- shape, even by only adding a column -- must drop first. Re-applies the
-- statement_timeout hardening from 033_harden_dashboard_functions.sql,
-- which the drop would otherwise reset.
DROP FUNCTION IF EXISTS week_item_day_totals(uuid);

CREATE OR REPLACE FUNCTION week_item_day_totals(p_week_id uuid)
RETURNS TABLE (
  menu_item_id uuid,
  name_he text,
  name_en text,
  unit text,
  category text,
  supplier_name text,
  delivery_date date,
  qty numeric
) AS $$
  SELECT
    ol.menu_item_id,
    mi.name_he,
    mi.name_en,
    mi.unit,
    mi.category,
    s.name AS supplier_name,
    ol.delivery_date,
    SUM(ol.quantity) AS qty
  FROM order_lines ol
  JOIN customers c ON c.id = ol.customer_id AND c.active = true
  JOIN menu_items mi ON mi.id = ol.menu_item_id AND mi.name_he <> 'תאריך'
  LEFT JOIN suppliers s ON s.id = mi.supplier_id
  WHERE ol.week_id = p_week_id AND ol.quantity > 0
  GROUP BY ol.menu_item_id, mi.name_he, mi.name_en, mi.unit, mi.category, s.name, ol.delivery_date
$$ LANGUAGE sql STABLE SET statement_timeout = '20s';

GRANT EXECUTE ON FUNCTION week_item_day_totals(uuid) TO authenticated;
