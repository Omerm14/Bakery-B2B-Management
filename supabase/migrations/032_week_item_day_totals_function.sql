-- Same class of bug as dashboard_week_data (029): Weekly.jsx pulled raw
-- per-customer, per-day order_lines rows for a single week with no limit.
-- That was safe while a week's row count stayed under Supabase's 1000-row
-- default response cap, but growth in customers/items pushed a single
-- week past that (1303 rows confirmed for one real week), silently
-- truncating the response and undercounting totals.
--
-- Aggregates server-side to one row per (item, day) — the day-level detail
-- Weekly's grid needs — collapsing away the per-customer dimension that was
-- the main source of row bloat. Result size is bounded by items × 7 days
-- regardless of how many customers or how much order history exist.
CREATE OR REPLACE FUNCTION week_item_day_totals(p_week_id uuid)
RETURNS TABLE (
  menu_item_id uuid,
  name_he text,
  unit text,
  category text,
  supplier_name text,
  delivery_date date,
  qty numeric
) AS $$
  SELECT
    ol.menu_item_id,
    mi.name_he,
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
  GROUP BY ol.menu_item_id, mi.name_he, mi.unit, mi.category, s.name, ol.delivery_date
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION week_item_day_totals(uuid) TO authenticated;
