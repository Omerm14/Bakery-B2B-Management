-- Inactive (dormant) menu items must not be orderable, copied forward, or
-- produced. Until now `menu_items.active` only hid the item from the two
-- catalogs (staff grid + portal RPC) — existing lines kept rolling forward
-- every Wednesday and kept showing up in production/packing.
--
-- Three pieces:
--   1. Wednesday rollover skips inactive items.
--   2. Deactivating an item zeroes its lines from today onward (audited via
--      the existing log_order_line_audit trigger). Past weeks are untouched
--      so history/reports stay truthful.
--   3. A write guard rejects adding or increasing quantity for an inactive
--      item from any path (staff grid, portal, import, scripts). Clearing or
--      lowering a line is still allowed.

-- 1. Full redefinition of run_weekly_rollover() carried over from migration
-- 057 (CREATE OR REPLACE swaps the whole body, so the no_carry_forward and
-- auto_sync filters and the notifications CTE must be reproduced here). The
-- only change vs 057 is the menu_items join.
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
    JOIN menu_items mi ON mi.id = ol.menu_item_id AND mi.active
    WHERE ol.week_id = v_this_week_id AND ol.quantity > 0 AND (ol.no_carry_forward IS NOT TRUE)
    ON CONFLICT (week_id, customer_id, menu_item_id, delivery_date) DO NOTHING
    RETURNING customer_id
  )
  INSERT INTO order_change_notifications (customer_id, week_id, created_at)
  SELECT DISTINCT customer_id, v_next_week_id, now() FROM inserted;
END;
$$ LANGUAGE plpgsql;

-- 2. Write guard. Only rejects a line that would ADD quantity for an
-- inactive item: a new row with quantity > 0, or an update that raises it.
-- Lowering / zeroing stays allowed (the deactivation cleanup below relies
-- on that), and touching other columns of an old line doesn't trip it.
-- Note: an upsert fires BEFORE INSERT on the proposed row first, so a
-- conflicting upsert with quantity > 0 is rejected here too.
CREATE OR REPLACE FUNCTION reject_inactive_item_order_line() RETURNS trigger
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.quantity > 0
     AND (TG_OP = 'INSERT' OR NEW.quantity > COALESCE(OLD.quantity, 0))
     AND EXISTS (SELECT 1 FROM menu_items WHERE id = NEW.menu_item_id AND active = false) THEN
    RAISE EXCEPTION 'הפריט אינו פעיל ולא ניתן להזמין אותו'
      USING ERRCODE = 'check_violation', HINT = 'inactive_menu_item';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reject_inactive_item_order_line ON order_lines;
CREATE TRIGGER trg_reject_inactive_item_order_line
  BEFORE INSERT OR UPDATE ON order_lines
  FOR EACH ROW EXECUTE FUNCTION reject_inactive_item_order_line();

-- 3. Deactivation cleanup: zero every line from today onward. Each zeroed
-- row is logged by trg_order_line_audit, so the change log shows exactly
-- which customers/days were cleared and why.
CREATE OR REPLACE FUNCTION zero_future_lines_on_item_deactivate() RETURNS trigger
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.active AND NOT NEW.active THEN
    UPDATE order_lines
    SET quantity = 0,
        change_reason = 'internal_decision',
        change_note = 'פריט הושבת',
        changed_by = COALESCE(auth.email(), 'system'),
        changed_via = 'item_deactivated',
        updated_at = now()
    WHERE menu_item_id = NEW.id
      AND delivery_date >= current_date
      AND quantity > 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_zero_future_lines_on_item_deactivate ON menu_items;
CREATE TRIGGER trg_zero_future_lines_on_item_deactivate
  AFTER UPDATE OF active ON menu_items
  FOR EACH ROW EXECUTE FUNCTION zero_future_lines_on_item_deactivate();

-- One-time backfill: items that were already inactive before this migration
-- never went through the trigger above, so their future lines (copied
-- forward every Wednesday until now) still count toward production. Same
-- update, same audit trail.
UPDATE order_lines ol
SET quantity = 0,
    change_reason = 'internal_decision',
    change_note = 'פריט הושבת',
    changed_by = 'system:migration_061',
    changed_via = 'item_deactivated',
    updated_at = now()
FROM menu_items mi
WHERE mi.id = ol.menu_item_id
  AND mi.active = false
  AND ol.delivery_date >= current_date
  AND ol.quantity > 0;

-- Settings "dormant items" helper: distinct items with any real order on or
-- after p_since. Done server-side because 8 weeks of order_lines is far
-- past PostgREST's row cap, and the client only needs the distinct ids.
CREATE OR REPLACE FUNCTION recently_ordered_item_ids(p_since date)
RETURNS TABLE (menu_item_id uuid) AS $$
  SELECT DISTINCT ol.menu_item_id
  FROM order_lines ol
  WHERE ol.delivery_date >= p_since AND ol.quantity > 0
$$ LANGUAGE sql STABLE SET statement_timeout = '20s';

GRANT EXECUTE ON FUNCTION recently_ordered_item_ids(date) TO authenticated;
