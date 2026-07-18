-- Multi-tenant SaaS foundation, step 3: tenant-scoping columns.
--
-- Adds a nullable `organization_id` to every client-owned table. Nullable
-- for now (not NOT NULL) since these columns need to be backfilled before
-- they can be required — that backfill only happens once, against the one
-- real Urban Bakery org, as part of the production cutover (migration 063).
-- Staging validation should backfill its own test orgs' data the same way
-- before treating NOT NULL as safe to add there too.
ALTER TABLE suppliers                 ADD COLUMN IF NOT EXISTS organization_id uuid references organizations(id);
ALTER TABLE customers                 ADD COLUMN IF NOT EXISTS organization_id uuid references organizations(id);
ALTER TABLE menu_items                ADD COLUMN IF NOT EXISTS organization_id uuid references organizations(id);
ALTER TABLE categories                ADD COLUMN IF NOT EXISTS organization_id uuid references organizations(id);
ALTER TABLE weeks                     ADD COLUMN IF NOT EXISTS organization_id uuid references organizations(id);
ALTER TABLE order_lines               ADD COLUMN IF NOT EXISTS organization_id uuid references organizations(id);
ALTER TABLE packing_checks            ADD COLUMN IF NOT EXISTS organization_id uuid references organizations(id);
ALTER TABLE production_checks         ADD COLUMN IF NOT EXISTS organization_id uuid references organizations(id);
ALTER TABLE order_line_audit          ADD COLUMN IF NOT EXISTS organization_id uuid references organizations(id);
ALTER TABLE order_change_notifications ADD COLUMN IF NOT EXISTS organization_id uuid references organizations(id);
ALTER TABLE customer_favorite_items    ADD COLUMN IF NOT EXISTS organization_id uuid references organizations(id);

CREATE INDEX IF NOT EXISTS idx_suppliers_org ON suppliers(organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_org ON customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_org ON menu_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_categories_org ON categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_weeks_org ON weeks(organization_id);
CREATE INDEX IF NOT EXISTS idx_order_lines_org ON order_lines(organization_id);
CREATE INDEX IF NOT EXISTS idx_packing_checks_org ON packing_checks(organization_id);
CREATE INDEX IF NOT EXISTS idx_production_checks_org ON production_checks(organization_id);
CREATE INDEX IF NOT EXISTS idx_order_line_audit_org ON order_line_audit(organization_id);
CREATE INDEX IF NOT EXISTS idx_order_change_notifications_org ON order_change_notifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_customer_favorite_items_org ON customer_favorite_items(organization_id);

-- packing_checks/production_checks have no customer write path (staff
-- only) and their org is fully determined by the row they reference —
-- derive `organization_id` server-side instead of trusting a
-- client-supplied value, removing a whole class of "the app forgot to
-- stamp organization_id" bugs on these two tables specifically.
CREATE OR REPLACE FUNCTION derive_packing_check_org() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  SELECT organization_id INTO NEW.organization_id FROM order_lines WHERE id = NEW.order_line_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_derive_packing_check_org ON packing_checks;
CREATE TRIGGER trg_derive_packing_check_org
  BEFORE INSERT OR UPDATE ON packing_checks
  FOR EACH ROW EXECUTE FUNCTION derive_packing_check_org();

CREATE OR REPLACE FUNCTION derive_production_check_org() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  SELECT organization_id INTO NEW.organization_id FROM menu_items WHERE id = NEW.menu_item_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_derive_production_check_org ON production_checks;
CREATE TRIGGER trg_derive_production_check_org
  BEFORE INSERT OR UPDATE ON production_checks
  FOR EACH ROW EXECUTE FUNCTION derive_production_check_org();

-- customer_favorite_items is written directly by the customer portal
-- client (CustomerOrders.jsx's toggleFavorite) — derive its organization_id
-- server-side from customer_id too, same reasoning as above, so no
-- frontend change is needed there at all.
CREATE OR REPLACE FUNCTION derive_favorite_item_org() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  SELECT organization_id INTO NEW.organization_id FROM customers WHERE id = NEW.customer_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_derive_favorite_item_org ON customer_favorite_items;
CREATE TRIGGER trg_derive_favorite_item_org
  BEFORE INSERT OR UPDATE ON customer_favorite_items
  FOR EACH ROW EXECUTE FUNCTION derive_favorite_item_org();

-- order_line_audit is populated exclusively by log_order_line_audit()
-- (migration 006/023's SECURITY DEFINER trigger) — extend it to copy
-- organization_id from the order_lines row being audited, same
-- server-derived approach as above (never a client-supplied value).
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
      customer_name, item_name_he, organization_id)
    VALUES (NEW.id, NEW.week_id, NEW.customer_id, NEW.menu_item_id, NEW.delivery_date,
      'insert', null, NEW.quantity, NEW.source, NEW.change_reason, NEW.change_note, NEW.changed_by,
      NEW.changed_via, v_customer_name, v_item_name_he, NEW.organization_id);
  ELSIF (TG_OP = 'UPDATE') THEN
    IF (NEW.quantity IS DISTINCT FROM OLD.quantity) OR (NEW.change_reason IS DISTINCT FROM OLD.change_reason) THEN
      INSERT INTO order_line_audit (order_line_id, week_id, customer_id, menu_item_id, delivery_date,
        action, old_quantity, new_quantity, source, change_reason, change_note, changed_by, changed_via,
        customer_name, item_name_he, organization_id)
      VALUES (NEW.id, NEW.week_id, NEW.customer_id, NEW.menu_item_id, NEW.delivery_date,
        'update', OLD.quantity, NEW.quantity, NEW.source, NEW.change_reason, NEW.change_note, NEW.changed_by,
        NEW.changed_via, v_customer_name, v_item_name_he, NEW.organization_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
