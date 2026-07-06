-- Change-source audit trail for order_lines.

-- 1. Distinguish bulk Excel import from a human typing in the order grid —
--    both previously shared 'manual'.
ALTER TABLE order_lines DROP CONSTRAINT IF EXISTS order_lines_source_check;
ALTER TABLE order_lines ADD CONSTRAINT order_lines_source_check
  CHECK (source IN ('manual', 'import', 'noga', 'forecast'));

-- 2. "Reason for the row's current value" — denormalized onto order_lines so
--    an in-grid tooltip doesn't need to join the audit table.
ALTER TABLE order_lines
  ADD COLUMN IF NOT EXISTS change_reason text,
  ADD COLUMN IF NOT EXISTS change_note text,
  ADD COLUMN IF NOT EXISTS changed_by text,
  ADD COLUMN IF NOT EXISTS changed_via text;

ALTER TABLE order_lines DROP CONSTRAINT IF EXISTS order_lines_change_reason_check;
ALTER TABLE order_lines ADD CONSTRAINT order_lines_change_reason_check
  CHECK (change_reason IS NULL OR change_reason IN ('customer_request', 'internal_decision', 'correction', 'other', 'import', 'forecast'));

ALTER TABLE order_lines DROP CONSTRAINT IF EXISTS order_lines_changed_via_check;
ALTER TABLE order_lines ADD CONSTRAINT order_lines_changed_via_check
  CHECK (changed_via IS NULL OR changed_via IN ('orders_grid', 'bulk_fill', 'copy_prev_week', 'import', 'forecast_lock'));

-- 3. Append-only history — survives later edits and even deletion of the
--    parent customer/menu_item (name snapshots kept legible either way).
CREATE TABLE IF NOT EXISTS order_line_audit (
  id              uuid primary key default gen_random_uuid(),
  order_line_id   uuid references order_lines(id) on delete set null,
  week_id         uuid references weeks(id) on delete set null,
  customer_id     uuid references customers(id) on delete set null,
  menu_item_id    uuid references menu_items(id) on delete set null,
  delivery_date   date not null,
  action          text not null check (action in ('insert', 'update')),
  old_quantity    numeric(10,2),
  new_quantity    numeric(10,2) not null,
  source          text not null,
  change_reason   text,
  change_note     text,
  changed_by      text,
  changed_via     text,
  customer_name   text,
  item_name_he    text,
  created_at      timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_order_line_audit_order_line ON order_line_audit(order_line_id);
CREATE INDEX IF NOT EXISTS idx_order_line_audit_customer_date ON order_line_audit(customer_id, delivery_date);
CREATE INDEX IF NOT EXISTS idx_order_line_audit_created_at ON order_line_audit(created_at desc);

ALTER TABLE order_line_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON order_line_audit FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Trigger: auto-log every insert/update of order_lines, so no write path
--    (this app today, or anything else tomorrow) can forget to record history.
CREATE OR REPLACE FUNCTION log_order_line_audit() RETURNS trigger AS $$
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

DROP TRIGGER IF EXISTS trg_order_line_audit ON order_lines;
CREATE TRIGGER trg_order_line_audit
  AFTER INSERT OR UPDATE ON order_lines
  FOR EACH ROW EXECUTE FUNCTION log_order_line_audit();
