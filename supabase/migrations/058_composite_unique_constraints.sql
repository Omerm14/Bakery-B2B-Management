-- Multi-tenant SaaS foundation, step 4: composite unique constraints.
--
-- Only NATURAL-key constraints need to become composite with
-- organization_id — uuid-PK-keyed constraints (order_lines,
-- packing_checks, production_checks) don't, since two different orgs can
-- never produce the same uuid, and once migration 059's FK-consistency
-- trigger holds, those are already transitively org-scoped through their
-- FKs. The 4 below are genuinely global today and would otherwise let one
-- org's row block a second org from ever using the same human-chosen name.
ALTER TABLE weeks DROP CONSTRAINT IF EXISTS weeks_start_date_key;
ALTER TABLE weeks ADD CONSTRAINT weeks_organization_id_start_date_key UNIQUE (organization_id, start_date);

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_name_key;
ALTER TABLE customers ADD CONSTRAINT customers_organization_id_name_key UNIQUE (organization_id, name);

ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS menu_items_name_he_key;
ALTER TABLE menu_items ADD CONSTRAINT menu_items_organization_id_name_he_key UNIQUE (organization_id, name_he);

ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_key;
ALTER TABLE categories ADD CONSTRAINT categories_organization_id_name_key UNIQUE (organization_id, name);
