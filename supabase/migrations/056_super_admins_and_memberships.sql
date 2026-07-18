-- Multi-tenant SaaS foundation, step 2: staff provisioning.
--
-- Replaces the flat, global `staff_allowlist(email)` table (migration 039)
-- with two separate tables, kept apart deliberately so "can act as any
-- org" is a person-level property, not tied to any single org row:
--
--   memberships   -- normal client staff: exactly one organization,
--                     permanently, for now (see plan decision 7)
--   super_admins  -- a small internal team (Floory's own) who can access
--                     any client org, for support/onboarding/demos
--
-- `staff_allowlist` itself is left in place for now (still consulted by
-- nothing after this migration) and only dropped once production has been
-- stable post-cutover (migration 064).

CREATE TABLE IF NOT EXISTS memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email           text not null,
  role            text not null default 'staff' check (role in ('staff')),
  added_at        timestamptz not null default now(),
  added_by        text,

  -- One org per person, permanently, for now — relax to a real multi-org
  -- membership model later if a client's own staff member ever genuinely
  -- needs to work across two unrelated bakery clients (not expected at the
  -- "tens of clients, admin-provisioned" stage this is designed for).
  unique (email)
);

CREATE TABLE IF NOT EXISTS super_admins (
  email      text primary key,
  added_at   timestamptz not null default now(),
  added_by   text
);

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;

-- Both tables are admin-provisioned only (see plan decision 5) — never
-- exposed to regular client staff, only to super-admins themselves.
CREATE POLICY "super_admin_all" ON memberships FOR ALL TO authenticated
  USING (is_staff() AND is_super_admin()) WITH CHECK (is_staff() AND is_super_admin());
CREATE POLICY "super_admin_all" ON super_admins FOR ALL TO authenticated
  USING (is_staff() AND is_super_admin()) WITH CHECK (is_staff() AND is_super_admin());

-- Signup-time claim assignment. Mirrors migration 039's
-- handle_new_user_staff_check(), generalized to set organization_id (from
-- memberships) and is_super_admin (from super_admins) independently — a
-- super-admin's account never gets organization_id set, per the design
-- above. Case-insensitive matching (migration 053's fix, carried forward)
-- since email casing has always varied between what a Google account
-- reports and what gets typed into these tables.
CREATE OR REPLACE FUNCTION handle_new_user_staff_check() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT organization_id INTO v_org_id FROM memberships WHERE lower(email) = lower(NEW.email);
  IF v_org_id IS NOT NULL THEN
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', 'staff', 'organization_id', v_org_id)
    WHERE id = NEW.id;
  END IF;

  IF EXISTS (SELECT 1 FROM super_admins WHERE lower(email) = lower(NEW.email)) THEN
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data || '{"role": "staff", "is_super_admin": true}'::jsonb
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_staff_check ON auth.users;
CREATE TRIGGER on_auth_user_created_staff_check
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_staff_check();

-- Retroactive promotion (migration 053's fix, carried forward per table):
-- the moment a row lands in `memberships`/`super_admins`, promote any
-- auth.users row that already exists with that email — otherwise someone
-- who signed in before being provisioned would stay stuck, since the
-- signup trigger above only fires for brand-new accounts.
CREATE OR REPLACE FUNCTION handle_membership_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', 'staff', 'organization_id', NEW.organization_id)
  WHERE lower(email) = lower(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_membership_insert ON memberships;
CREATE TRIGGER on_membership_insert
  AFTER INSERT ON memberships
  FOR EACH ROW EXECUTE FUNCTION handle_membership_insert();

CREATE OR REPLACE FUNCTION handle_super_admin_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data || '{"role": "staff", "is_super_admin": true}'::jsonb
  WHERE lower(email) = lower(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_super_admin_insert ON super_admins;
CREATE TRIGGER on_super_admin_insert
  AFTER INSERT ON super_admins
  FOR EACH ROW EXECUTE FUNCTION handle_super_admin_insert();

-- Revocation — a real gap inherited from today's design: removing a row
-- from `staff_allowlist` has never actually stripped an already-issued
-- claim from the matching auth.users row. That gap matters far more once
-- there are many client orgs to revoke access from (e.g. offboarding one
-- client's employee must not leave them able to read another client's
-- data merely because their token hasn't expired yet). Strips only the
-- specific claim the deleted row granted, leaving any other claim intact.
CREATE OR REPLACE FUNCTION handle_membership_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = (raw_app_meta_data - 'organization_id') || '{"role": ""}'::jsonb
  WHERE lower(email) = lower(OLD.email)
    AND NOT EXISTS (SELECT 1 FROM super_admins WHERE lower(email) = lower(OLD.email));
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_membership_delete ON memberships;
CREATE TRIGGER on_membership_delete
  AFTER DELETE ON memberships
  FOR EACH ROW EXECUTE FUNCTION handle_membership_delete();

CREATE OR REPLACE FUNCTION handle_super_admin_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data - 'is_super_admin'
  WHERE lower(email) = lower(OLD.email);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_super_admin_delete ON super_admins;
CREATE TRIGGER on_super_admin_delete
  AFTER DELETE ON super_admins
  FOR EACH ROW EXECUTE FUNCTION handle_super_admin_delete();

-- Assumption (not enforced by this migration): a person is either in
-- `memberships` (one org, permanently) or in `super_admins` (any org, via
-- the frontend switcher) — not both. Nothing stops adding someone to both,
-- but the two claims aren't reconciled against each other if so (their
-- `organization_id` claim would stay set to their membership's org even
-- though they're also a super-admin) — not expected to matter in practice
-- since super-admins are Floory's own small internal team, not client staff.

-- Important operational note (not enforced by this migration): revoking
-- access this way only updates auth.users' stored claims — a session
-- whose JWT was already minted keeps its old claims until the token
-- refreshes. Any admin action that removes a membership or super-admin
-- row should be paired with forcing that user's session(s) to end
-- (e.g. via the Supabase Auth admin API), not relied on alone.
