-- The Wednesday auto-copy rollover (027_weekly_rollover_function.sql)
-- deliberately sent no notification of any kind. Staff now want to see
-- it in the same "floor" bell as customer-portal sends, since it's a real
-- change to next week's orders even though no customer touched it --
-- unlike routine internal edits (orders_grid, copy_prev_week, import),
-- which stay out of the notification feed on purpose.
--
-- Only customers whose order_lines were actually inserted by THIS run
-- get notified -- RETURNING off the ON CONFLICT DO NOTHING insert means a
-- customer who already had next week filled in (so nothing new landed)
-- is correctly skipped, and re-running the function never double-notifies.
CREATE OR REPLACE FUNCTION run_weekly_rollover() RETURNS void
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_this_week_start date := current_date - extract(dow FROM current_date)::int;
  v_next_week_start date := v_this_week_start + 7;
  v_this_week_id uuid;
  v_next_week_id uuid;
BEGIN
  SELECT id INTO v_this_week_id FROM weeks WHERE start_date = v_this_week_start;
  IF v_this_week_id IS NULL THEN
    RAISE NOTICE 'run_weekly_rollover: no week row for %, nothing to copy', v_this_week_start;
    RETURN;
  END IF;

  INSERT INTO weeks (start_date, label)
  VALUES (v_next_week_start, 'שבוע ' || to_char(v_next_week_start, 'DD/MM/YYYY'))
  ON CONFLICT (start_date) DO NOTHING
  RETURNING id INTO v_next_week_id;

  IF v_next_week_id IS NULL THEN
    SELECT id INTO v_next_week_id FROM weeks WHERE start_date = v_next_week_start;
  END IF;

  WITH inserted AS (
    INSERT INTO order_lines (week_id, customer_id, menu_item_id, delivery_date, quantity,
      source, status, change_reason, change_note, changed_by, changed_via, updated_at)
    SELECT v_next_week_id, ol.customer_id, ol.menu_item_id, ol.delivery_date + 7, ol.quantity,
      'manual', 'ok', 'auto_copy', 'הועתק אוטומטית ע"י המערכת ביום רביעי', 'system:weekly_rollover',
      'auto_copy_weekly', now()
    FROM order_lines ol
    JOIN customers c ON c.id = ol.customer_id AND c.active
    WHERE ol.week_id = v_this_week_id AND ol.quantity > 0
    ON CONFLICT (week_id, customer_id, menu_item_id, delivery_date) DO NOTHING
    RETURNING customer_id
  )
  INSERT INTO order_change_notifications (customer_id, week_id, created_at)
  SELECT DISTINCT customer_id, v_next_week_id, now() FROM inserted;
END;
$$ LANGUAGE plpgsql;
