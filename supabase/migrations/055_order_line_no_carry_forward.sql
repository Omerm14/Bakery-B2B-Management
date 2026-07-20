-- Lets a customer mark a specific quantity change as "this week only" —
-- suppresses all three forward-copy paths (Wednesday cron rollover,
-- portal lazy-fill on view, staff's manual copy-prev-week button) for
-- that one order_lines row. Defaults to false so every existing row and
-- every write path that doesn't set it explicitly keeps recurring,
-- exactly like today.
ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS no_carry_forward boolean NOT NULL DEFAULT false;

-- Audit trail should show whether a change was applied as one-time so
-- staff isn't confused later about why a bump didn't carry into next
-- week (order_line_audit is append-only history, separate table).
ALTER TABLE order_line_audit ADD COLUMN IF NOT EXISTS no_carry_forward boolean;

-- SECURITY DEFINER preserved from migration 023 (order_line_audit RLS is
-- staff-only, so a customer's own edit firing this trigger still needs to
-- run as the function owner, not the caller's restricted role).
CREATE OR REPLACE FUNCTION log_order_line_audit() RETURNS trigger
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_customer_name text;
  v_item_name_he  text;
BEGIN
  SELECT name INTO v_customer_name FROM customers WHERE id = NEW.customer_id;
  SELECT name_he INTO v_item_name_he FROM menu_items WHERE id = NEW.menu_item_id;

  IF (TG_OP = 'INSERT') THEN
    INSERT INTO order_line_audit (order_line_id, week_id, customer_id, menu_item_id, delivery_date,
      action, old_quantity, new_quantity, source, change_reason, change_note, changed_by, changed_via,
      customer_name, item_name_he, no_carry_forward)
    VALUES (NEW.id, NEW.week_id, NEW.customer_id, NEW.menu_item_id, NEW.delivery_date,
      'insert', null, NEW.quantity, NEW.source, NEW.change_reason, NEW.change_note, NEW.changed_by,
      NEW.changed_via, v_customer_name, v_item_name_he, NEW.no_carry_forward);
  ELSIF (TG_OP = 'UPDATE') THEN
    IF (NEW.quantity IS DISTINCT FROM OLD.quantity) OR (NEW.change_reason IS DISTINCT FROM OLD.change_reason)
       OR (NEW.no_carry_forward IS DISTINCT FROM OLD.no_carry_forward) THEN
      INSERT INTO order_line_audit (order_line_id, week_id, customer_id, menu_item_id, delivery_date,
        action, old_quantity, new_quantity, source, change_reason, change_note, changed_by, changed_via,
        customer_name, item_name_he, no_carry_forward)
      VALUES (NEW.id, NEW.week_id, NEW.customer_id, NEW.menu_item_id, NEW.delivery_date,
        'update', OLD.quantity, NEW.quantity, NEW.source, NEW.change_reason, NEW.change_note, NEW.changed_by,
        NEW.changed_via, v_customer_name, v_item_name_he, NEW.no_carry_forward);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- trg_order_line_audit already points at this function name — no re-CREATE TRIGGER needed.

-- Wednesday cron rollover: skip rows flagged one-time.
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
    WHERE ol.week_id = v_this_week_id AND ol.quantity > 0 AND (ol.no_carry_forward IS NOT TRUE)
    ON CONFLICT (week_id, customer_id, menu_item_id, delivery_date) DO NOTHING
    RETURNING customer_id
  )
  INSERT INTO order_change_notifications (customer_id, week_id, created_at)
  SELECT DISTINCT customer_id, v_next_week_id, now() FROM inserted;
END;
$$ LANGUAGE plpgsql;
