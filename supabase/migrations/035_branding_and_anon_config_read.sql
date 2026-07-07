-- Fix: app_config's read policy only granted SELECT to `authenticated`,
-- but the customer login page (/portal/login) runs with NO session at
-- all — it's the anon key, before any sign-in. That means the
-- support_contact fallback added earlier has likely never actually
-- returned data in production, and the new branding lookup below would
-- hit the same wall. app_config holds nothing sensitive (cutoff rules,
-- support contact, branding) — it's operational config, safe to read
-- publicly, same trust level as get_customer_auth_email() already being
-- public. Widen the read policy to anon too.
DROP POLICY IF EXISTS "authenticated_select_config" ON app_config;
CREATE POLICY "public_select_config" ON app_config FOR SELECT TO anon, authenticated USING (true);

-- White-label branding: a logo + business name staff can set once (in
-- Settings) so the customer-facing login page can look like the client's
-- own brand instead of a generic Floory screen. Nullable — the login page
-- falls back to a generic placeholder until staff upload something.
INSERT INTO app_config (key, value) VALUES
  ('branding', '{"logo_url": null, "business_name": null}')
ON CONFLICT (key) DO NOTHING;

-- Storage bucket for the logo image itself. Public read (the login page
-- that displays it has no session), staff-only write.
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "branding_public_read" ON storage.objects;
CREATE POLICY "branding_public_read" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "branding_staff_insert" ON storage.objects;
CREATE POLICY "branding_staff_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'branding' AND is_staff());

DROP POLICY IF EXISTS "branding_staff_update" ON storage.objects;
CREATE POLICY "branding_staff_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'branding' AND is_staff());

DROP POLICY IF EXISTS "branding_staff_delete" ON storage.objects;
CREATE POLICY "branding_staff_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'branding' AND is_staff());
