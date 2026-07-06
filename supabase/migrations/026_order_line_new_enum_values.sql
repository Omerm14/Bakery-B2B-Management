-- New change_reason/changed_via values for Phase B writers: the automatic
-- Wednesday rollover, and a customer editing their own order directly.

ALTER TABLE order_lines DROP CONSTRAINT IF EXISTS order_lines_change_reason_check;
ALTER TABLE order_lines ADD CONSTRAINT order_lines_change_reason_check
  CHECK (change_reason IS NULL OR change_reason IN
    ('customer_request', 'internal_decision', 'correction', 'other', 'import', 'forecast', 'auto_copy'));

ALTER TABLE order_lines DROP CONSTRAINT IF EXISTS order_lines_changed_via_check;
ALTER TABLE order_lines ADD CONSTRAINT order_lines_changed_via_check
  CHECK (changed_via IS NULL OR changed_via IN
    ('orders_grid', 'bulk_fill', 'copy_prev_week', 'import', 'forecast_lock', 'auto_copy_weekly', 'customer_portal'));
