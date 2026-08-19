-- Let staff exempt a customer from the automatic week-to-week carry-forward
-- of their order ("auto-sync"). Defaults true so every existing customer
-- keeps today's behavior and no write path has to set it explicitly.
--
-- Only the two AUTOMATIC copy paths honor this flag: the Wednesday cron
-- rollover below, and the portal's lazy-fill on view (CustomerOrders.jsx).
-- Staff's manual "copy previous week" button deliberately still works — it's
-- an explicit click, not automation — and just confirms first.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS auto_sync boolean NOT NULL DEFAULT true;

-- Full redefinition of run_weekly_rollover() carried over from migration 055
-- (CREATE OR REPLACE swaps the whole body, so the no_carry_forward filter and
-- the order_change_notifications CTE from 055 must be reproduced here or they
-- would be silently dropped). The only change vs 055 is `AND c.auto_sync` on
-- the customers join.
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
    JOIN customers c ON c.id = ol.customer_id AND c.active AND c.auto_sync
    WHERE ol.week_id = v_this_week_id AND ol.quantity > 0 AND (ol.no_carry_forward IS NOT TRUE)
    ON CONFLICT (week_id, customer_id, menu_item_id, delivery_date) DO NOTHING
    RETURNING customer_id
  )
  INSERT INTO order_change_notifications (customer_id, week_id, created_at)
  SELECT DISTINCT customer_id, v_next_week_id, now() FROM inserted;
END;
$$ LANGUAGE plpgsql;
