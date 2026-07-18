-- ============================================================================
-- PRODUCTION CUTOVER MIGRATION — DO NOT RUN until staging validation (plan
-- Phase B) has passed in full against a rehearsal copy of this exact
-- sequence. This is the one migration in the whole redesign that touches
-- Urban Bakery's live, real data in place. Everything before this file
-- (055-062) is purely additive/backward-compatible and safe to apply to
-- production at any time; this one is not — it backfills every existing
-- row to a single new "Urban Bakery" organization, flips 4 columns to
-- NOT NULL, and migrates the 3 app_config rows into it. `app_config` and
-- `staff_allowlist` are deliberately left in place afterwards (not
-- dropped) as a rollback window — only removed in migration 064, once
-- production has been stable for a bake-in period post-cutover.
-- ============================================================================

DO $$
DECLARE
  v_org_id uuid;
BEGIN

-- 1. Create the Urban Bakery organization row, seeded from today's
--    app_config rows (migrations 022/035) so its branding/support-contact/
--    cutoff settings carry over unchanged. Change the slug below before
--    running if 'urban-bakery' isn't the desired customer-portal URL slug
--    (it becomes /portal/urban-bakery/login).
INSERT INTO organizations (name, slug, business_name, logo_url,
  support_contact_name, support_contact_phone, support_contact_whatsapp_link,
  cutoff_lock_time, timezone, created_by)
SELECT
  'Urban Bakery',
  'urban-bakery',
  (SELECT value ->> 'business_name' FROM app_config WHERE key = 'branding'),
  (SELECT value ->> 'logo_url' FROM app_config WHERE key = 'branding'),
  (SELECT value ->> 'name' FROM app_config WHERE key = 'support_contact'),
  (SELECT value ->> 'phone' FROM app_config WHERE key = 'support_contact'),
  (SELECT value ->> 'whatsapp_link' FROM app_config WHERE key = 'support_contact'),
  coalesce((SELECT (value ->> 'lock_time')::time FROM app_config WHERE key = 'cutoff_rules'), '10:30'),
  'Asia/Jerusalem',
  'migration_063_cutover'
RETURNING id INTO v_org_id;

-- 2. Backfill organization_id on every existing row. Order matters for the
--    tables with a BEFORE INSERT/UPDATE org-derivation trigger (migrations
--    057/059) — parent tables first so the trigger's derivation confirms
--    (not contradicts) the value being set here; since every row in this
--    single-tenant database belongs to this one org, derivation and this
--    explicit backfill always agree.
UPDATE suppliers  SET organization_id = v_org_id WHERE organization_id IS NULL;
UPDATE customers  SET organization_id = v_org_id WHERE organization_id IS NULL;
UPDATE menu_items SET organization_id = v_org_id WHERE organization_id IS NULL;
UPDATE categories SET organization_id = v_org_id WHERE organization_id IS NULL;
UPDATE weeks      SET organization_id = v_org_id WHERE organization_id IS NULL;

UPDATE order_lines               SET organization_id = v_org_id WHERE organization_id IS NULL;
UPDATE order_change_notifications SET organization_id = v_org_id WHERE organization_id IS NULL;
UPDATE packing_checks            SET organization_id = v_org_id WHERE organization_id IS NULL;
UPDATE production_checks         SET organization_id = v_org_id WHERE organization_id IS NULL;
UPDATE customer_favorite_items   SET organization_id = v_org_id WHERE organization_id IS NULL;

-- order_line_audit has no org-derivation trigger of its own (it's an
-- append-only history table, populated only for NEW rows going forward by
-- log_order_line_audit()) — backfill its existing rows directly.
UPDATE order_line_audit SET organization_id = v_org_id WHERE organization_id IS NULL;

-- 3. Seed memberships from staff_allowlist — every existing staff member
--    becomes a member of the one Urban Bakery org. staff_allowlist itself
--    is left in place (see header note).
INSERT INTO memberships (organization_id, email, added_by)
SELECT v_org_id, email, 'migration_063_cutover'
FROM staff_allowlist
ON CONFLICT (email) DO NOTHING;

END $$;

-- 4. Seed the platform super-admin(s). Adjust the email below before
--    running — this grants cross-org access, so keep this list small.
INSERT INTO super_admins (email, added_by) VALUES
  ('omermoran14@gmail.com', 'migration_063_cutover')
ON CONFLICT (email) DO NOTHING;

-- 5. Only now that every row has a value, require it going forward.
ALTER TABLE suppliers                  ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE customers                  ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE menu_items                 ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE categories                 ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE weeks                      ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE order_lines                ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE order_change_notifications ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE packing_checks             ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE production_checks          ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE customer_favorite_items    ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE order_line_audit           ALTER COLUMN organization_id SET NOT NULL;
