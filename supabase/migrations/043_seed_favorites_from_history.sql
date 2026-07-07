-- Bulk-seeds customer_favorite_items from actual order history, so
-- customers don't have to manually star every item they already order
-- regularly. An item counts as "frequently ordered" for a customer when
-- it appears with quantity > 0 in at least p_min_weeks of the most
-- recent p_lookback_weeks weeks (defaults: 3 of the last 8).
--
-- ON CONFLICT DO NOTHING makes this safe to re-run, but note it is a
-- one-way seed, not a continuously-synced rule: if a customer later
-- un-favorites an item that still qualifies, re-running this function
-- will re-add it. Intended to be triggered on demand by staff (see the
-- "Seed favorites from history" button in Settings), not on a schedule.
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
    SELECT id FROM weeks ORDER BY start_date DESC LIMIT p_lookback_weeks
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

GRANT EXECUTE ON FUNCTION seed_favorite_items_from_history(int, int) TO authenticated;
