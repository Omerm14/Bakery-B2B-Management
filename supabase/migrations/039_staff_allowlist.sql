-- Security fix: is_staff() previously defaulted a MISSING role claim to
-- 'staff' (see migration 022's comment -- this was intentional at the time,
-- to make RLS tightening a zero-behavior-change for existing Google-OAuth
-- staff sessions, none of which carried a role claim). The unintended
-- consequence: ANY brand-new Google sign-in at /login -- including a
-- customer who used the wrong link -- got a session that is_staff() (and
-- the client's isCustomer check) treated as staff, i.e. full internal
-- read/write access. This migration closes that gap without locking out
-- real staff, in an order that never leaves a window where they'd be
-- denied:
--   1) create the allowlist
--   2) backfill an explicit role:'staff' claim onto every current
--      non-customer account, and seed the allowlist from those emails
--   3) add a trigger so future Google OAuth signups by allowlisted emails
--      still get role:'staff' set automatically
--   4) only now flip is_staff()'s default to deny-by-default

CREATE TABLE IF NOT EXISTS staff_allowlist (
  email      text primary key,
  added_at   timestamptz not null default now(),
  added_by   text
);

ALTER TABLE staff_allowlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_all" ON staff_allowlist FOR ALL TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());

-- Every current non-customer account is a real staff member today --
-- give them an explicit claim so they survive the default flip below.
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role": "staff"}'::jsonb
WHERE (raw_app_meta_data ->> 'role') IS DISTINCT FROM 'customer'
  AND email IS NOT NULL;

INSERT INTO staff_allowlist (email, added_by)
SELECT email, 'migration_039_backfill'
FROM auth.users
WHERE raw_app_meta_data ->> 'role' = 'staff'
ON CONFLICT (email) DO NOTHING;

-- Auto-assign role:'staff' to any future signup whose email is
-- allowlisted -- mirrors Supabase's standard handle_new_user trigger
-- idiom, since the admin API can't target a user id that doesn't exist
-- yet at signup time.
CREATE OR REPLACE FUNCTION handle_new_user_staff_check() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email IS NOT NULL AND EXISTS (
    SELECT 1 FROM staff_allowlist WHERE email = NEW.email
  ) THEN
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data || '{"role": "staff"}'::jsonb
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_staff_check ON auth.users;
CREATE TRIGGER on_auth_user_created_staff_check
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_staff_check();

-- Only now flip the default to deny -- every real staff account has
-- already been backfilled above, so this cannot lock any of them out.
CREATE OR REPLACE FUNCTION is_staff() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'staff'
$$;
