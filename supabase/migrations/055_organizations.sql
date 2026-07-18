-- Multi-tenant SaaS foundation, step 1: the `organizations` table.
--
-- Floory is moving from a single hardcoded bakery ("Urban Bakery") to a
-- real multi-client product. Every bakery client becomes a row here, and
-- every client-owned table (added in migration 057) gets an
-- `organization_id` pointing at one of these rows. Isolation between
-- clients is enforced at the Postgres RLS layer, not just app-code
-- filtering — see migration 059.
--
-- The 3 keys previously crammed into the generic `app_config` key/value
-- table (cutoff_rules, support_contact, branding) are folded into real
-- typed columns here instead of carried forward as a per-tenant-scoped
-- key/value table — cleaner and type-safe now that this is real
-- infrastructure, not a single-tenant afterthought. `app_config` itself is
-- left in place for now (see migration 063) and only dropped once
-- production has been stable post-cutover (migration 064).
-- current_organization_id()/is_super_admin() are defined here (rather than
-- alongside memberships/super_admins in migration 056) purely to satisfy
-- Postgres's ordering requirement — CREATE POLICY resolves function
-- references at creation time, and organizations' own RLS policy below
-- needs both. Both only ever read JWT claims, no table dependency.
--
-- current_organization_id(): used identically for staff and customer
-- sessions — both get `organization_id` set in app_metadata at
-- provisioning time (see migration 056's triggers and the set-customer-pin
-- Edge Function). Null for a super-admin session (see migration 056) —
-- "which org am I acting as" lives in frontend state only, never the JWT.
CREATE OR REPLACE FUNCTION current_organization_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')::uuid
$$;

-- is_super_admin(): true only for the small, explicitly-flagged set of
-- internal accounts in the `super_admins` table (migration 056) — never a
-- default, and never set for regular client staff.
CREATE OR REPLACE FUNCTION is_super_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false)
$$;

CREATE TABLE IF NOT EXISTS organizations (
  id                             uuid primary key default gen_random_uuid(),
  name                           text not null,
  slug                           text not null unique check (slug ~ '^[a-z0-9-]+$'),
  active                         boolean not null default true,
  is_demo                        boolean not null default false,
  created_at                     timestamptz not null default now(),
  created_by                     text,

  -- Customer-facing branding (formerly app_config key 'branding')
  business_name                  text,
  logo_url                       text,

  -- Support contact shown on the customer portal (formerly app_config key 'support_contact')
  support_contact_name           text,
  support_contact_phone          text,
  support_contact_whatsapp_link  text,

  -- Order-edit cutoff rule (formerly app_config key 'cutoff_rules')
  cutoff_lock_time               time not null default '10:30',
  timezone                       text not null default 'Asia/Jerusalem'
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Staff can see/manage only their own org; super-admins (migration 056)
-- can see/manage every org. No anon/public policy at all — pre-login
-- customer-portal access to branding/support-contact goes through a
-- narrow SECURITY DEFINER RPC (migration 060), not a table read grant,
-- unlike today's `app_config.public_select_config` (USING (true) for
-- anon — a real, currently-open gap this design deliberately avoids
-- repeating).
CREATE POLICY "staff_all" ON organizations FOR ALL TO authenticated
  USING (is_staff() AND (id = current_organization_id() OR is_super_admin()))
  WITH CHECK (is_staff() AND (id = current_organization_id() OR is_super_admin()));
