-- Adds mi.name_en to dashboard_week_data so the Dashboard's "top item"
-- stat and "top 10 items" list respect the English language toggle,
-- mirroring the same name_en addition already done for
-- week_item_day_totals in migration 037. Postgres won't let CREATE OR
-- REPLACE change a function's RETURNS TABLE shape, even by only adding a
-- column -- must drop first. Re-applies the statement_timeout hardening
-- from 033_harden_dashboard_functions.sql, which the drop would
-- otherwise reset.
DROP FUNCTION IF EXISTS dashboard_week_data(uuid[]);

CREATE OR REPLACE FUNCTION dashboard_week_data(p_week_ids uuid[])
RETURNS TABLE (
  week_id uuid,
  item_id uuid,
  item_name text,
  item_name_en text,
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
  SELECT it.week_id, it.menu_item_id, mi.name_he, mi.name_en, it.qty, cc.active_customers
  FROM item_totals it
  JOIN menu_items mi ON mi.id = it.menu_item_id
  JOIN cust_counts cc ON cc.week_id = it.week_id
$$ LANGUAGE sql STABLE SET statement_timeout = '20s';

GRANT EXECUTE ON FUNCTION dashboard_week_data(uuid[]) TO authenticated;
