-- Foundation for Phase B: customer self-service portal login.
--
-- Customers log in via WhatsApp OTP (verified in an Edge Function), not
-- Supabase's built-in phone/SMS auth. Each customer gets a real
-- auth.users row, keyed by a synthetic never-emailed address, so that a
-- normal Supabase session (magic-link token redemption) can be minted for
-- them after OTP verification. See supabase/functions/verify-customer-otp.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auth_email text UNIQUE;

-- Small key/value config table for values that must be editable without a
-- redeploy: the cutoff rule's lock time, and the "contact Amit" info shown
-- when a customer is blocked past cutoff. Not secret — readable by staff
-- and customers alike, write-restricted to staff (see migration 008).
CREATE TABLE IF NOT EXISTS app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

INSERT INTO app_config (key, value) VALUES
  ('cutoff_rules', '{"lock_time": "10:30"}'),
  ('support_contact', '{"name": "עמית", "phone": "", "whatsapp_link": ""}')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- is_staff(): true for every existing Google-OAuth staff session, because
-- those JWTs carry no `role` claim at all — coalesce defaults them to
-- 'staff'. This is what makes migration 008's RLS tightening a zero
-- behavior-change for staff: nothing about their session or app_metadata
-- changes, so this function evaluates exactly the same as `true` did for
-- them before.
CREATE OR REPLACE FUNCTION is_staff() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'staff') = 'staff'
$$;

-- current_customer_id(): null for staff sessions (no such claim), the
-- customer's own id for a portal session (set via admin.createUser's
-- app_metadata at provisioning time — see provision-and-welcome-customer).
CREATE OR REPLACE FUNCTION current_customer_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(auth.jwt() -> 'app_metadata' ->> 'customer_id', '')::uuid
$$;
