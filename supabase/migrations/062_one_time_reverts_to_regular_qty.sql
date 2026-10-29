-- A one-time change must revert next week, not delete the product.
--
-- Until now a line flagged no_carry_forward (migration 055) was simply
-- skipped by every forward-copy path, so a one-time bump 12 -> 15 left the
-- cell EMPTY next week instead of back at 12. Since staff edits started
-- defaulting to one-time (2026-10-14) whole products vanished from customers'
-- orders the following week.
--
-- Fix: the row remembers its regular quantity. When a line becomes one-time,
-- carry_forward_quantity keeps the quantity it had just before; copy-forward
-- uses that instead of skipping the row:
--   12 -> 15 one-time  => next week 12
--   12 -> 0  one-time  => next week 12
--    0 -> 5  one-time  => nothing next week (regular quantity was 0)
--   12 -> 15 permanent => next week 15 (unchanged behavior)

ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS carry_forward_quantity numeric(10,2);

-- 1. Keep carry_forward_quantity right on every write path (staff grid,
-- portal, import, scripts) without clients having to send it. An upsert only
-- sends the columns in its payload, so on UPDATE NEW.carry_forward_quantity
-- already equals OLD's unless a caller set it explicitly.
CREATE OR REPLACE FUNCTION set_carry_forward_quantity() RETURNS trigger
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT NEW.no_carry_forward THEN
    -- Permanent line: next week copies quantity itself.
    NEW.carry_forward_quantity := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    -- Brand-new one-time cell: nothing to come back to.
    NEW.carry_forward_quantity := COALESCE(NEW.carry_forward_quantity, 0);
  ELSIF NOT OLD.no_carry_forward THEN
    -- Line just turned one-time: remember the quantity it had until now.
    NEW.carry_forward_quantity := OLD.quantity;
  END IF;
  -- Already one-time and edited again: keep the remembered regular quantity.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_carry_forward_quantity ON order_lines;
CREATE TRIGGER trg_set_carry_forward_quantity
  BEFORE INSERT OR UPDATE ON order_lines
  FOR EACH ROW EXECUTE FUNCTION set_carry_forward_quantity();

-- 2. Full redefinition of run_weekly_rollover() carried over from migration
-- 061 (auto_sync, active-item filter and notifications CTE kept). The only
-- change: a one-time line copies its regular quantity instead of being skipped.
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

-- 3. Backfill: one-time lines from this week onward were flagged before the
-- column existed. Their regular quantity is the old_quantity of the audit row
-- where the flag last turned on (insert -> 0). Lines with no such audit row
-- stay NULL, which copy-forward treats as 0 (same as before this migration).
-- The trigger above keeps the explicit value (the flag doesn't change), and
-- the audit trigger logs nothing (quantity/reason/flag unchanged).
WITH ordered AS (
  SELECT a.order_line_id, a.id, a.created_at, a.old_quantity,
         COALESCE(a.no_carry_forward, false) AS flagged,
         LAG(COALESCE(a.no_carry_forward, false))
           OVER (PARTITION BY a.order_line_id ORDER BY a.created_at, a.id) AS prev_flagged
  FROM order_line_audit a
  WHERE a.action IN ('insert', 'update')
    AND a.order_line_id IN (
      SELECT id FROM order_lines
      WHERE no_carry_forward
        AND delivery_date >= current_date - extract(dow FROM current_date)::int)
),
turned_on AS (
  SELECT DISTINCT ON (order_line_id) order_line_id, old_quantity
  FROM ordered
  WHERE flagged AND prev_flagged IS DISTINCT FROM true
  ORDER BY order_line_id, created_at DESC, id DESC
)
UPDATE order_lines ol
SET carry_forward_quantity = COALESCE(t.old_quantity, 0)
FROM turned_on t
WHERE ol.id = t.order_line_id;
