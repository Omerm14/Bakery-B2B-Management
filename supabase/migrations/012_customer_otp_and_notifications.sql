-- OTP codes (hashed, short-lived, attempt-capped) and a log of every
-- WhatsApp message the system sends, for debugging Meta API failures.
-- Both are written exclusively by Edge Functions using the service-role
-- key (which bypasses RLS), so a staff-only read policy is sufficient —
-- no customer or anon access is ever needed to these tables directly.

CREATE TABLE IF NOT EXISTS customer_otp_codes (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id) on delete cascade,
  code_hash    text not null,
  expires_at   timestamptz not null,
  attempts     int not null default 0,
  max_attempts int not null default 5,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_customer_otp_codes_customer_created ON customer_otp_codes(customer_id, created_at DESC);

ALTER TABLE customer_otp_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_all" ON customer_otp_codes FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());

CREATE TABLE IF NOT EXISTS notification_log (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid references customers(id) on delete set null,
  channel             text not null default 'whatsapp' check (channel in ('whatsapp')),
  notification_type   text not null check (notification_type in ('otp', 'weekly_reminder', 'welcome', 'other')),
  template_name       text,
  recipient_phone     text,
  week_id             uuid references weeks(id) on delete set null,
  status              text not null check (status in ('sent', 'failed', 'skipped')),
  provider_message_id text,
  error_detail        text,
  created_at          timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_notification_log_customer_type_week ON notification_log(customer_id, notification_type, week_id);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_all" ON notification_log FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());
