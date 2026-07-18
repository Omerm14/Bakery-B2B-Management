-- Multi-tenant SaaS foundation, step 5: RLS rewrite.
--
-- Standard pattern for every tenant table's staff policy: staff can act on
-- a row only if it belongs to their own org, OR they're a super-admin
-- (migration 056) acting on any org. Customer-facing policies mostly need
-- NO change — they're already keyed by a globally-unique customer uuid,
-- which a customer session can't forge across orgs — except
-- `customer_select_weeks`, fixed below (see plan §3 for why).
--
-- NOTE: `app_config.public_select_config` (migration 035, USING (true) for
-- anon — a real, currently-open gap) is DELIBERATELY left untouched here,
-- not fixed in this migration. Dropping it now would break the still-
-- deployed OLD frontend's pre-login branding/support-contact reads during
-- the window between applying this migration and deploying the new
-- frontend code (which reads `organizations` / `get_organization_public_info`
-- instead, see migration 060). It's removed in migration 064's cleanup,
-- once the new frontend is confirmed live and app_config is provably
-- unused.

DROP POLICY IF EXISTS "staff_all" ON suppliers;
CREATE POLICY "staff_all" ON suppliers FOR ALL TO authenticated
  USING (is_staff() AND (organization_id = current_organization_id() OR is_super_admin()))
  WITH CHECK (is_staff() AND (organization_id = current_organization_id() OR is_super_admin()));

DROP POLICY IF EXISTS "staff_all" ON menu_items;
CREATE POLICY "staff_all" ON menu_items FOR ALL TO authenticated
  USING (is_staff() AND (organization_id = current_organization_id() OR is_super_admin()))
  WITH CHECK (is_staff() AND (organization_id = current_organization_id() OR is_super_admin()));

DROP POLICY IF EXISTS "staff_all" ON categories;
CREATE POLICY "staff_all" ON categories FOR ALL TO authenticated
  USING (is_staff() AND (organization_id = current_organization_id() OR is_super_admin()))
  WITH CHECK (is_staff() AND (organization_id = current_organization_id() OR is_super_admin()));

DROP POLICY IF EXISTS "staff_all" ON packing_checks;
CREATE POLICY "staff_all" ON packing_checks FOR ALL TO authenticated
  USING (is_staff() AND (organization_id = current_organization_id() OR is_super_admin()))
  WITH CHECK (is_staff() AND (organization_id = current_organization_id() OR is_super_admin()));

DROP POLICY IF EXISTS "staff_all" ON production_checks;
CREATE POLICY "staff_all" ON production_checks FOR ALL TO authenticated
  USING (is_staff() AND (organization_id = current_organization_id() OR is_super_admin()))
  WITH CHECK (is_staff() AND (organization_id = current_organization_id() OR is_super_admin()));

DROP POLICY IF EXISTS "staff_all" ON order_line_audit;
CREATE POLICY "staff_all" ON order_line_audit FOR ALL TO authenticated
  USING (is_staff() AND (organization_id = current_organization_id() OR is_super_admin()))
  WITH CHECK (is_staff() AND (organization_id = current_organization_id() OR is_super_admin()));

DROP POLICY IF EXISTS "staff_all" ON order_change_notifications;
CREATE POLICY "staff_all" ON order_change_notifications FOR ALL TO authenticated
  USING (is_staff() AND (organization_id = current_organization_id() OR is_super_admin()))
  WITH CHECK (is_staff() AND (organization_id = current_organization_id() OR is_super_admin()));

DROP POLICY IF EXISTS "staff_all" ON customer_favorite_items;
CREATE POLICY "staff_all" ON customer_favorite_items FOR ALL TO authenticated
  USING (is_staff() AND (organization_id = current_organization_id() OR is_super_admin()))
  WITH CHECK (is_staff() AND (organization_id = current_organization_id() OR is_super_admin()));

DROP POLICY IF EXISTS "staff_all" ON customers;
CREATE POLICY "staff_all" ON customers FOR ALL TO authenticated
  USING (is_staff() AND (organization_id = current_organization_id() OR is_super_admin()))
  WITH CHECK (is_staff() AND (organization_id = current_organization_id() OR is_super_admin()));
-- customer_select_self (id = current_customer_id()) — unchanged, already safe.

DROP POLICY IF EXISTS "staff_all" ON weeks;
CREATE POLICY "staff_all" ON weeks FOR ALL TO authenticated
  USING (is_staff() AND (organization_id = current_organization_id() OR is_super_admin()))
  WITH CHECK (is_staff() AND (organization_id = current_organization_id() OR is_super_admin()));

-- The one genuinely dangerous customer policy today: USING (true) lets any
-- customer of ANY org read every org's weeks rows. Scope it.
DROP POLICY IF EXISTS "customer_select_weeks" ON weeks;
CREATE POLICY "customer_select_weeks" ON weeks FOR SELECT TO authenticated
  USING (organization_id = current_organization_id());

DROP POLICY IF EXISTS "staff_all" ON order_lines;
CREATE POLICY "staff_all" ON order_lines FOR ALL TO authenticated
  USING (is_staff() AND (organization_id = current_organization_id() OR is_super_admin()))
  WITH CHECK (is_staff() AND (organization_id = current_organization_id() OR is_super_admin()));
-- customer_select_own / customer_insert_own / customer_update_own
-- (customer_id = current_customer_id(), migrations 023/025) — unchanged,
-- already safe; the FK-consistency trigger below is what actually needs
-- adding for order_lines, not an RLS policy edit.

-- ---------------------------------------------------------------------
-- FK-forgery prevention (the gap a flat organization_id-equality policy
-- does NOT close on its own): nothing stops a session from writing an
-- order_lines row whose organization_id is correctly its own but whose
-- week_id/menu_item_id point at a DIFFERENT org's row — both are valid
-- FKs, just to the wrong tenant. Fix: derive organization_id from
-- customer_id server-side (never trust a client-supplied value — this
-- also means neither the staff app nor the customer portal needs to
-- remember to stamp organization_id on order_lines writes at all), then
-- verify week_id and menu_item_id actually belong to that same org.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_order_line_org_consistency() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_week_org uuid;
  v_item_org uuid;
BEGIN
  SELECT organization_id INTO NEW.organization_id FROM customers WHERE id = NEW.customer_id;

  SELECT organization_id INTO v_week_org FROM weeks WHERE id = NEW.week_id;
  IF v_week_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'order_lines.week_id belongs to a different organization than customer_id';
  END IF;

  SELECT organization_id INTO v_item_org FROM menu_items WHERE id = NEW.menu_item_id;
  IF v_item_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'order_lines.menu_item_id belongs to a different organization than customer_id';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_order_line_org_consistency ON order_lines;
CREATE TRIGGER trg_check_order_line_org_consistency
  BEFORE INSERT OR UPDATE ON order_lines
  FOR EACH ROW EXECUTE FUNCTION check_order_line_org_consistency();

-- Same class of check for order_change_notifications (customer-writable —
-- customer_insert_own, migration 036).
CREATE OR REPLACE FUNCTION check_order_change_notification_org_consistency() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_week_org uuid;
BEGIN
  SELECT organization_id INTO NEW.organization_id FROM customers WHERE id = NEW.customer_id;

  SELECT organization_id INTO v_week_org FROM weeks WHERE id = NEW.week_id;
  IF v_week_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'order_change_notifications.week_id belongs to a different organization than customer_id';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_order_change_notification_org_consistency ON order_change_notifications;
CREATE TRIGGER trg_check_order_change_notification_org_consistency
  BEFORE INSERT OR UPDATE ON order_change_notifications
  FOR EACH ROW EXECUTE FUNCTION check_order_change_notification_org_consistency();
