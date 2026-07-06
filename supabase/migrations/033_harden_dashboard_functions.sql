-- dashboard_week_data hit Postgres's statement timeout once called with
-- PostgREST's count:'exact' option, which runs the whole (aggregating)
-- query a second time just to compute an exact row count — removed that
-- client-side (see Dashboard.jsx), but hardening the function itself too:
--
-- 1. MATERIALIZED forces the `filtered` CTE to be computed once and reused
--    by both downstream aggregations, instead of Postgres potentially
--    inlining and re-scanning/re-joining order_lines for each of them.
-- 2. A per-function statement_timeout override gives real headroom beyond
--    whatever the default role/database timeout is, without having to
--    loosen that default for every other query.
CREATE OR REPLACE FUNCTION dashboard_week_data(p_week_ids uuid[])
RETURNS TABLE (
  week_id uuid,
  item_id uuid,
  item_name text,
  item_qty numeric,
  active_customers bigint
) AS $$
  WITH filtered AS MATERIALIZED (
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
$$ LANGUAGE sql STABLE SET statement_timeout = '20s';

GRANT EXECUTE ON FUNCTION dashboard_week_data(uuid[]) TO authenticated;

-- Same hardening for Weekly's per-week aggregation function.
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
$$ LANGUAGE sql STABLE SET statement_timeout = '20s';

GRANT EXECUTE ON FUNCTION week_item_day_totals(uuid) TO authenticated;

-- Covering index so the filter + join in both functions can be satisfied
-- largely from the index itself instead of hitting the heap for every row.
CREATE INDEX IF NOT EXISTS idx_order_lines_week_covering
  ON order_lines(week_id, customer_id, menu_item_id, quantity)
  WHERE quantity > 0;
