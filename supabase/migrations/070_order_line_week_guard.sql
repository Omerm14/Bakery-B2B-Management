-- An order line's delivery_date must fall inside the week it belongs to.
--
-- Incident (found 2026-11-04): on 2026-08-21 the customer portal saved 5 of
-- Gazeti's lines dated 25-29.08 under the week starting 30.08. The customer
-- had edited the week of 23.08, moved on to the next week, and the send used
-- the new week's id with the old week's dates (fixed in CustomerOrders.jsx).
-- Nothing stopped such a row:
--   * the unique key is (week_id, customer_id, menu_item_id, delivery_date),
--     so the stray row sat NEXT TO the real one for the same date instead of
--     replacing it;
--   * screens that read by week (Orders, Weekly, portal) never show it, while
--     Production reads by delivery_date and baked it on top of the real one;
--   * run_weekly_rollover() copies everything with this week's week_id and
--     shifts the date by 7, so the stray row was re-created one week later,
--     every Wednesday — 45 copies in 10 weeks (plus 5 from "copy previous
--     week"). Every week Production showed ~15 extra units for Gazeti.
--
-- This migration:
--   1. rejects any write that puts a line outside its week (every path:
--      staff grid, portal, import, copies, scripts);
--   2. makes the rollover and its drop check read only lines whose date is
--      inside the week being copied, so stray rows already in the table
--      (cleanup: supabase/scripts/cleanup_out_of_week_order_lines.sql) are
--      never copied forward again.
--
-- The trigger fires on INSERT and when week_id / delivery_date change, not on
-- quantity edits, so it never blocks writes to a stray row that is still in
-- the table — only the creation of new ones.

-- 1. Guard ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION reject_order_line_outside_week() RETURNS trigger
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_start date;
BEGIN
  SELECT start_date INTO v_start FROM weeks WHERE id = NEW.week_id;
  IF v_start IS NOT NULL
     AND NEW.delivery_date NOT BETWEEN v_start AND v_start + 6 THEN
    RAISE EXCEPTION 'תאריך האספקה % אינו בתוך השבוע שמתחיל ב-%',
        to_char(NEW.delivery_date, 'DD/MM/YYYY'), to_char(v_start, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation', HINT = 'delivery_date_outside_week';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reject_order_line_outside_week ON order_lines;
CREATE TRIGGER trg_reject_order_line_outside_week
  BEFORE INSERT OR UPDATE OF week_id, delivery_date ON order_lines
  FOR EACH ROW EXECUTE FUNCTION reject_order_line_outside_week();

-- 2. Rollover — full redefinition carried over from migration 062. The only
-- change: the source lines must be dated inside this week.
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

  WITH src AS (
    SELECT ol.customer_id, ol.menu_item_id, ol.delivery_date,
      CASE WHEN ol.no_carry_forward THEN COALESCE(ol.carry_forward_quantity, 0)
           ELSE ol.quantity END AS quantity
    FROM order_lines ol
    JOIN customers c ON c.id = ol.customer_id AND c.active AND c.auto_sync
    JOIN menu_items mi ON mi.id = ol.menu_item_id AND mi.active
    WHERE ol.week_id = v_this_week_id
      AND ol.delivery_date BETWEEN v_this_week_start AND v_this_week_start + 6
  ),
  inserted AS (
    INSERT INTO order_lines (week_id, customer_id, menu_item_id, delivery_date, quantity,
      source, status, change_reason, change_note, changed_by, changed_via, updated_at)
    SELECT v_next_week_id, s.customer_id, s.menu_item_id, s.delivery_date + 7, s.quantity,
      'manual', 'ok', 'auto_copy', 'הועתק אוטומטית ע"י המערכת ביום רביעי', 'system:weekly_rollover',
      'auto_copy_weekly', now()
    FROM src s
    WHERE s.quantity > 0
    ON CONFLICT (week_id, customer_id, menu_item_id, delivery_date) DO NOTHING
    RETURNING customer_id
  )
  INSERT INTO order_change_notifications (customer_id, week_id, created_at)
  SELECT DISTINCT customer_id, v_next_week_id, now() FROM inserted;
END;
$$ LANGUAGE plpgsql;

-- 3. Drop check — full redefinition carried over from migration 063, same
-- single change, so a stray row is not "expected" next week either.
CREATE OR REPLACE FUNCTION check_rollover_drops() RETURNS integer
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_this_week_start date := current_date - extract(dow FROM current_date)::int;
  v_this_week_id uuid;
  v_next_week_id uuid;
  v_count integer;
BEGIN
  SELECT id INTO v_this_week_id FROM weeks WHERE start_date = v_this_week_start;
  IF v_this_week_id IS NULL THEN
    RETURN 0;
  END IF;
  SELECT id INTO v_next_week_id FROM weeks WHERE start_date = v_this_week_start + 7;

  WITH expected AS (
    SELECT ol.customer_id, ol.menu_item_id, ol.delivery_date + 7 AS delivery_date,
      CASE WHEN ol.no_carry_forward THEN COALESCE(ol.carry_forward_quantity, 0)
           ELSE ol.quantity END AS quantity
    FROM order_lines ol
    JOIN customers c ON c.id = ol.customer_id
    JOIN menu_items mi ON mi.id = ol.menu_item_id
    WHERE ol.week_id = v_this_week_id
      AND ol.delivery_date BETWEEN v_this_week_start AND v_this_week_start + 6
      AND c.active AND c.auto_sync AND mi.active
  ),
  inserted AS (
    -- No next-week row at all (v_next_week_id NULL) means the rollover never
    -- ran: every expected cell is missing. The alert then points at this
    -- week, the only week row there is.
    INSERT INTO rollover_drop_alerts (customer_id, week_id, menu_item_id, delivery_date, expected_quantity)
    SELECT e.customer_id, COALESCE(v_next_week_id, v_this_week_id), e.menu_item_id, e.delivery_date, e.quantity
    FROM expected e
    WHERE e.quantity > 0
      AND NOT EXISTS (
        SELECT 1 FROM order_lines x
        WHERE x.customer_id = e.customer_id AND x.menu_item_id = e.menu_item_id
          AND x.delivery_date = e.delivery_date)
    ON CONFLICT (customer_id, menu_item_id, delivery_date) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM inserted;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
