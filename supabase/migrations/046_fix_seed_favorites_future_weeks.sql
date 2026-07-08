-- Fix seed_favorite_items_from_history() (migration 043): recent_weeks
-- picked the p_lookback_weeks rows with the LATEST start_date in the whole
-- `weeks` table, with no bound relative to today. Since a `weeks` row gets
-- created the moment anyone (staff or a customer) merely navigates to that
-- week's grid — well before it has any real orders — a handful of future
-- weeks browsed ahead of time were consistently newer than the actual past
-- weeks with order history, pushing the real data out of the LIMIT and
-- leaving frequency counts at (near) zero. Bound recent_weeks to weeks that
-- have already started so it only ever looks at real history.
CREATE OR REPLACE FUNCTION seed_favorite_items_from_history(p_min_weeks int DEFAULT 3, p_lookback_weeks int DEFAULT 8)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'staff access required';
  END IF;

  WITH recent_weeks AS (
    SELECT id FROM weeks WHERE start_date <= CURRENT_DATE ORDER BY start_date DESC LIMIT p_lookback_weeks
  ),
  frequency AS (
    SELECT ol.customer_id, ol.menu_item_id, COUNT(DISTINCT ol.week_id) AS weeks_ordered
    FROM order_lines ol
    JOIN recent_weeks rw ON rw.id = ol.week_id
    WHERE ol.quantity > 0
    GROUP BY ol.customer_id, ol.menu_item_id
    HAVING COUNT(DISTINCT ol.week_id) >= p_min_weeks
  ),
  inserted AS (
    INSERT INTO customer_favorite_items (customer_id, menu_item_id)
    SELECT customer_id, menu_item_id FROM frequency
    ON CONFLICT (customer_id, menu_item_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM inserted;

  RETURN v_count;
END;
$$;
