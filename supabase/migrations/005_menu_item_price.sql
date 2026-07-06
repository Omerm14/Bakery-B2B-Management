-- Optional wholesale price per menu item. Nullable = "not set". Not surfaced
-- anywhere customer-facing yet (no customer portal exists).
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS price numeric(10,2);
