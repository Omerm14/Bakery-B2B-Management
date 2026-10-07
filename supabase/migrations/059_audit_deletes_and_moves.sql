-- Close the two holes that let an order line's history go cold:
--
-- 1. DELETE was never logged — a removed line simply vanished.
-- 2. An UPDATE that moves a line (different customer, item, date or week)
--    without changing its quantity was skipped by the "quantity or reason
--    changed" filter, so the line silently changed owner/day.
--
-- Found while tracing phantom future orders: rows written by a bulk Excel
-- import before this table existed had no insert event at all, and there
-- was no way to tell them apart from real orders. With every insert,
-- update, move and delete now logged, any future order line with no
-- 'insert' event can only be pre-audit data.
--
-- Actor for delete/move: these rarely carry fresh changed_by/changed_via
-- values on the row, so the logged-in user's email from the request JWT is
-- used instead, falling back to the database role (e.g. 'postgres' for an
-- edit made in the Supabase SQL editor — which is itself worth knowing).

ALTER TABLE order_line_audit DROP CONSTRAINT IF EXISTS order_line_audit_action_check;
ALTER TABLE order_line_audit ADD CONSTRAINT order_line_audit_action_check
  CHECK (action IN ('insert', 'update', 'move', 'delete'));

-- Full redefinition carried over from migration 055 (SECURITY DEFINER kept
-- from 023 — order_line_audit RLS is staff-only, so a customer's own edit
-- firing this trigger must still be able to write the audit row).
CREATE OR REPLACE FUNCTION log_order_line_audit() RETURNS trigger
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_customer_name text;
  v_item_name_he  text;
  v_actor         text := COALESCE(auth.jwt() ->> 'email', current_user);
BEGIN
  IF (TG_OP = 'DELETE') THEN
    SELECT name INTO v_customer_name FROM customers WHERE id = OLD.customer_id;
    SELECT name_he INTO v_item_name_he FROM menu_items WHERE id = OLD.menu_item_id;
    -- A delete can be a cascade from removing the week/customer/item itself;
    -- that parent row is already gone, so referencing it would violate the
    -- audit table's FKs and abort the whole delete. Keep only the ids that
    -- still exist — the name snapshots keep the row legible either way.
    INSERT INTO order_line_audit (order_line_id, week_id, customer_id, menu_item_id, delivery_date,
      action, old_quantity, new_quantity, source, change_reason, change_note, changed_by, changed_via,
      customer_name, item_name_he, no_carry_forward)
    VALUES (NULL,
      (SELECT id FROM weeks WHERE id = OLD.week_id),
      (SELECT id FROM customers WHERE id = OLD.customer_id),
      (SELECT id FROM menu_items WHERE id = OLD.menu_item_id),
      OLD.delivery_date,
      'delete', OLD.quantity, 0, OLD.source, NULL, 'שורה נמחקה', v_actor, NULL,
      v_customer_name, v_item_name_he, OLD.no_carry_forward);
    RETURN OLD;
  END IF;

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
    IF (NEW.customer_id IS DISTINCT FROM OLD.customer_id) OR (NEW.menu_item_id IS DISTINCT FROM OLD.menu_item_id)
       OR (NEW.delivery_date IS DISTINCT FROM OLD.delivery_date) OR (NEW.week_id IS DISTINCT FROM OLD.week_id) THEN
      INSERT INTO order_line_audit (order_line_id, week_id, customer_id, menu_item_id, delivery_date,
        action, old_quantity, new_quantity, source, change_reason, change_note, changed_by, changed_via,
        customer_name, item_name_he, no_carry_forward)
      VALUES (NEW.id, NEW.week_id, NEW.customer_id, NEW.menu_item_id, NEW.delivery_date,
        'move', OLD.quantity, NEW.quantity, NEW.source, NEW.change_reason,
        format('הועבר מ: לקוח %s, פריט %s, תאריך %s',
          COALESCE((SELECT name FROM customers WHERE id = OLD.customer_id), OLD.customer_id::text),
          COALESCE((SELECT name_he FROM menu_items WHERE id = OLD.menu_item_id), OLD.menu_item_id::text),
          to_char(OLD.delivery_date, 'DD/MM/YYYY')),
        v_actor, NEW.changed_via, v_customer_name, v_item_name_he, NEW.no_carry_forward);
    ELSIF (NEW.quantity IS DISTINCT FROM OLD.quantity) OR (NEW.change_reason IS DISTINCT FROM OLD.change_reason)
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

DROP TRIGGER IF EXISTS trg_order_line_audit ON order_lines;
CREATE TRIGGER trg_order_line_audit
  AFTER INSERT OR UPDATE OR DELETE ON order_lines
  FOR EACH ROW EXECUTE FUNCTION log_order_line_audit();
