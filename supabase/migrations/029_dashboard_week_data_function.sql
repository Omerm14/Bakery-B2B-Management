-- Aggregates order_lines server-side for the Dashboard's per-week stats and
-- trend chart, instead of pulling raw rows to the client and aggregating in
-- JS — that approach required paginating past Supabase's 1000-row response
-- cap once historical order volume grew, which was slow (multiple
-- round-trips) even parallelized. This returns one row per (week, item)
-- with that week's active-customer count attached, which is orders of
-- magnitude smaller than the raw per-customer, per-day order_lines rows —
-- comfortably within a single response regardless of how much history
-- accumulates.
CREATE OR REPLACE FUNCTION dashboard_week_data(p_week_ids uuid[])
RETURNS TABLE (
  week_id uuid,
  item_id uuid,
  item_name text,
  item_qty numeric,
  active_customers bigint
) AS $$
  WITH filtered AS (
    SELECT ol.week_id, ol.customer_id, ol.menu_item_id, ol.quantity
    FROM order_lines ol
    JOIN customers c ON c.id = ol.customer_id AND c.active = true
    JOIN menu_items mi ON mi.id = ol.menu_item_id AND mi.name_he <> 'תאריך'
    WHERE ol.week_id = ANY(p_week_ids) AND ol.quantity > 0
  ),
  item_totals AS (
    SELECT week_id, menu_item_id, SUM(quantity) AS qty
    FROM filtered
    GROUP BY week_id, menu_item_id
  ),
  cust_counts AS (
    SELECT week_id, COUNT(DISTINCT customer_id) AS active_customers
    FROM filtered
    GROUP BY week_id
  )
  SELECT it.week_id, it.menu_item_id, mi.name_he, it.qty, cc.active_customers
  FROM item_totals it
  JOIN menu_items mi ON mi.id = it.menu_item_id
  JOIN cust_counts cc ON cc.week_id = it.week_id
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION dashboard_week_data(uuid[]) TO authenticated;
