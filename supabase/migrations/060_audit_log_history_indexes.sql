-- Indexes for the change-log page's full-history browsing (AuditLog.jsx).
-- The page filters by customer, item, change date and delivery date, always
-- ordered newest-first and read one 100-row page at a time. Each composite
-- index below matches one filter together with that ORDER BY, so Postgres
-- walks the index and stops after the page instead of sorting a large set.
-- The change-date window alone is served by idx_order_line_audit_created_at
-- (migration 006); the line-history drill-down by
-- idx_order_line_audit_customer_date (customer_id, delivery_date).
--
-- Safe to run any time and more than once.

CREATE INDEX IF NOT EXISTS idx_order_line_audit_customer_created
  ON order_line_audit (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_line_audit_item_created
  ON order_line_audit (menu_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_line_audit_delivery_created
  ON order_line_audit (delivery_date, created_at DESC);
