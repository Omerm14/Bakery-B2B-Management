-- Sibling of dashboard_week_data (migration 041), grouping the same
-- filtered order_lines by customer instead of by item, so the Dashboard's
-- amber bar chart can show "top customers by quantity" for the viewed
-- week. Same statement_timeout hardening, same shape of pagination
-- (returns everything, top-10 capping stays client-side to match the
-- existing item version).
CREATE OR REPLACE FUNCTION dashboard_week_customer_data(p_week_ids uuid[])
RETURNS TABLE (
  week_id uuid,
  customer_id uuid,
  customer_name text,
  customer_name_en text,
  qty numeric
) AS $$
  WITH filtered AS MATERIALIZED (
    SELECT ol.week_id, ol.customer_id, ol.quantity
    FROM order_lines ol
    JOIN customers c ON c.id = ol.customer_id AND c.active = true
    JOIN menu_items mi ON mi.id = ol.menu_item_id AND mi.name_he <> 'תאריך'
    WHERE ol.week_id = ANY(p_week_ids) AND ol.quantity > 0
  ),
  cust_totals AS (
    SELECT week_id, customer_id, SUM(quantity) AS qty
    FROM filtered
    GROUP BY week_id, customer_id
  )
  SELECT ct.week_id, ct.customer_id, c.name, c.name_en, ct.qty
  FROM cust_totals ct
  JOIN customers c ON c.id = ct.customer_id
$$ LANGUAGE sql STABLE SET statement_timeout = '20s';

GRANT EXECUTE ON FUNCTION dashboard_week_customer_data(uuid[]) TO authenticated;
