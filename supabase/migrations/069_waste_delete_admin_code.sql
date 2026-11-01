-- Waste entries can no longer be deleted by regular staff. Deleting needs the
-- manager code, checked on the server so it can't be bypassed from the
-- browser:
--   1. The staff policy on waste_log drops DELETE (select/insert/update stay).
--   2. delete_waste_entry(id, code) is the only way to delete: it checks the
--      caller is staff and the code matches, then deletes the row.
--   3. The code is stored only as a salted SHA-256 hash in a table no client
--      can read. After 5 wrong codes in 15 minutes, deletes are locked until
--      the window passes, so the code can't be guessed by trying them all.
--   4. The owner sets or changes the code from the Supabase SQL editor:
--        SELECT set_waste_admin_code('the-code');
--      Clients can't call it (EXECUTE is revoked from anon/authenticated).

-- 1. No direct deletes.
DROP POLICY IF EXISTS "staff_all" ON waste_log;
DROP POLICY IF EXISTS "staff_select" ON waste_log;
DROP POLICY IF EXISTS "staff_insert" ON waste_log;
DROP POLICY IF EXISTS "staff_update" ON waste_log;
CREATE POLICY "staff_select" ON waste_log FOR SELECT TO authenticated USING (is_staff());
CREATE POLICY "staff_insert" ON waste_log FOR INSERT TO authenticated WITH CHECK (is_staff());
CREATE POLICY "staff_update" ON waste_log FOR UPDATE TO authenticated USING (is_staff()) WITH CHECK (is_staff());

-- 3. Code storage and the failed-attempt log. RLS on with no policies:
-- readable only by SECURITY DEFINER functions below.
CREATE TABLE IF NOT EXISTS waste_admin_code (
  id         boolean primary key default true check (id),
  salt       text not null,
  code_hash  text not null,
  updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS waste_admin_failures (
  id         bigint generated always as identity primary key,
  attempted_by text,
  created_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS waste_admin_failures_created_idx ON waste_admin_failures (created_at desc);
ALTER TABLE waste_admin_code ENABLE ROW LEVEL SECURITY;
ALTER TABLE waste_admin_failures ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION waste_admin_hash(p_salt text, p_code text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT encode(sha256(convert_to(p_salt || ':' || p_code, 'UTF8')), 'hex')
$$;

-- 4. Owner-only: set or replace the code.
CREATE OR REPLACE FUNCTION set_waste_admin_code(p_code text) RETURNS void
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code text := btrim(coalesce(p_code, ''));
  v_salt text := replace(gen_random_uuid()::text, '-', '');
BEGIN
  IF length(v_code) < 4 THEN
    RAISE EXCEPTION 'manager code must be at least 4 characters';
  END IF;
  INSERT INTO waste_admin_code (id, salt, code_hash, updated_at)
  VALUES (true, v_salt, waste_admin_hash(v_salt, v_code), now())
  ON CONFLICT (id) DO UPDATE SET salt = EXCLUDED.salt, code_hash = EXCLUDED.code_hash, updated_at = now();
  DELETE FROM waste_admin_failures;
END;
$$ LANGUAGE plpgsql;
REVOKE EXECUTE ON FUNCTION set_waste_admin_code(text) FROM PUBLIC, anon, authenticated;

-- 2. The only delete path. Returns a status the app maps to a message:
--   'deleted', 'bad_code', 'locked', 'no_code', 'not_found'.
-- A wrong code returns 'bad_code' instead of raising, so the failure record
-- it writes is committed and counts toward the lockout.
CREATE OR REPLACE FUNCTION delete_waste_entry(p_id uuid, p_code text) RETURNS text
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row waste_admin_code%ROWTYPE;
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM waste_admin_code WHERE id;
  IF NOT FOUND THEN
    RETURN 'no_code';
  END IF;
  IF (SELECT count(*) FROM waste_admin_failures WHERE created_at > now() - interval '15 minutes') >= 5 THEN
    RETURN 'locked';
  END IF;
  IF waste_admin_hash(v_row.salt, btrim(coalesce(p_code, ''))) <> v_row.code_hash THEN
    INSERT INTO waste_admin_failures (attempted_by) VALUES (auth.jwt() ->> 'email');
    RETURN 'bad_code';
  END IF;
  DELETE FROM waste_log WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  RETURN 'deleted';
END;
$$ LANGUAGE plpgsql;
REVOKE EXECUTE ON FUNCTION delete_waste_entry(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_waste_entry(uuid, text) TO authenticated;
