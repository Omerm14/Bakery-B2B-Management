-- Tighten RLS ahead of customer portal logins.
--
-- Every table today has a single `for all to authenticated using (true)`
-- policy — safe only because the sole class of authenticated session is
-- staff (Google OAuth). Once customer portal sessions exist (also
-- `authenticated`, distinguished only by JWT app_metadata), that blanket
-- policy would give every customer full read/write access to every other
-- customer's data. Replace it everywhere with an is_staff()-gated policy
-- (see migration 007) plus narrow, explicit customer-scoped policies only
-- where customers need access.
--
-- is_staff() defaults to true for any session with no `role` app_metadata
-- claim — i.e. every existing staff session — so this is a zero
-- behavior-change migration for staff.

DROP POLICY IF EXISTS "auth_all" ON suppliers;
CREATE POLICY "staff_all" ON suppliers FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());

DROP POLICY IF EXISTS "auth_all" ON menu_items;
CREATE POLICY "staff_all" ON menu_items FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());

DROP POLICY IF EXISTS "auth_all" ON packing_checks;
CREATE POLICY "staff_all" ON packing_checks FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());

DROP POLICY IF EXISTS "auth_all" ON noga_messages;
CREATE POLICY "staff_all" ON noga_messages FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());

DROP POLICY IF EXISTS "auth_all" ON forecasts;
CREATE POLICY "staff_all" ON forecasts FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());

DROP POLICY IF EXISTS "auth_all" ON production_checks;
CREATE POLICY "staff_all" ON production_checks FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());

DROP POLICY IF EXISTS "auth_all" ON import_log;
CREATE POLICY "staff_all" ON import_log FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());

DROP POLICY IF EXISTS "auth_all" ON order_line_audit;
CREATE POLICY "staff_all" ON order_line_audit FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());

-- customers: staff keep full access; a customer may only read their own row.
DROP POLICY IF EXISTS "auth_all" ON customers;
CREATE POLICY "staff_all" ON customers FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY "customer_select_self" ON customers FOR SELECT TO authenticated
  USING (id = current_customer_id());

-- weeks: staff keep full access (they create weeks); customers get
-- read-only access to know current/next week start dates. Nothing
-- sensitive is stored here, so a plain read grant is fine.
DROP POLICY IF EXISTS "auth_all" ON weeks;
CREATE POLICY "staff_all" ON weeks FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY "customer_select_weeks" ON weeks FOR SELECT TO authenticated USING (true);

-- order_lines: staff keep full access. Customers can only read their own
-- rows here — write access (INSERT/UPDATE, cutoff-gated) is added in
-- migration 010 once the cutoff-check function exists; deletes are never
-- granted to customers (order_lines.quantity=0 is how a "removed" line is
-- represented, matching how the staff grid already works).
DROP POLICY IF EXISTS "auth_all" ON order_lines;
CREATE POLICY "staff_all" ON order_lines FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY "customer_select_own" ON order_lines FOR SELECT TO authenticated
  USING (customer_id = current_customer_id());

-- app_config: staff manage it, everyone authenticated may read it (cutoff
-- lock time + support contact info are needed by the customer portal UI).
CREATE POLICY "staff_all" ON app_config FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY "authenticated_select_config" ON app_config FOR SELECT TO authenticated USING (true);

-- Fix: this trigger has run so far only because order_line_audit's RLS was
-- wide open. Once it's staff-only (above), a customer's own order edit
-- would fire this trigger, which would then try to insert into
-- order_line_audit as the customer's restricted role and get rejected —
-- breaking customer order-saving entirely. SECURITY DEFINER makes the
-- trigger's insert run as the function owner regardless of caller.
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
      customer_name, item_name_he)
    VALUES (NEW.id, NEW.week_id, NEW.customer_id, NEW.menu_item_id, NEW.delivery_date,
      'insert', null, NEW.quantity, NEW.source, NEW.change_reason, NEW.change_note, NEW.changed_by,
      NEW.changed_via, v_customer_name, v_item_name_he);
  ELSIF (TG_OP = 'UPDATE') THEN
    IF (NEW.quantity IS DISTINCT FROM OLD.quantity) OR (NEW.change_reason IS DISTINCT FROM OLD.change_reason) THEN
      INSERT INTO order_line_audit (order_line_id, week_id, customer_id, menu_item_id, delivery_date,
        action, old_quantity, new_quantity, source, change_reason, change_note, changed_by, changed_via,
        customer_name, item_name_he)
      VALUES (NEW.id, NEW.week_id, NEW.customer_id, NEW.menu_item_id, NEW.delivery_date,
        'update', OLD.quantity, NEW.quantity, NEW.source, NEW.change_reason, NEW.change_note, NEW.changed_by,
        NEW.changed_via, v_customer_name, v_item_name_he);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
