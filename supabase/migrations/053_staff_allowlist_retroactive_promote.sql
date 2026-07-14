-- Adding an email to staff_allowlist only granted access to accounts that
-- did not exist yet: the only trigger in migration 039 fires
-- AFTER INSERT ON auth.users, so it promotes a brand-new signup whose email
-- is already allowlisted. The common real case is the opposite order --
-- someone signs in first, lands on /access-pending because their auth.users
-- row already exists without role:'staff', and only then gets added here.
-- That admin "add" looked successful (row appears in Settings, toast fires)
-- but never touched the existing auth.users row, so the person stayed
-- locked out. This adds the missing direction: the moment a row lands in
-- staff_allowlist, retroactively promote any auth.users row that already
-- matches it. Matching is case-insensitive since staff_allowlist and
-- auth.users have each independently accumulated both cases over time.
CREATE OR REPLACE FUNCTION handle_staff_allowlist_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data || '{"role": "staff"}'::jsonb
  WHERE lower(email) = lower(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_staff_allowlist_insert ON staff_allowlist;
CREATE TRIGGER on_staff_allowlist_insert
  AFTER INSERT ON staff_allowlist
  FOR EACH ROW EXECUTE FUNCTION handle_staff_allowlist_insert();

-- Match case-insensitively on the signup path too, for the same reason.
CREATE OR REPLACE FUNCTION handle_new_user_staff_check() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email IS NOT NULL AND EXISTS (
    SELECT 1 FROM staff_allowlist WHERE lower(email) = lower(NEW.email)
  ) THEN
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data || '{"role": "staff"}'::jsonb
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
