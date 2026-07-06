-- Staff need to be able to look up a customer's current access PIN at any
-- time (to read it out again, not just at the moment it was generated) —
-- store a plaintext copy alongside the real Supabase Auth password set by
-- set-customer-pin. The two are always set together and always equal; this
-- column is purely a staff-facing convenience, not the credential actually
-- checked at login (that's still auth.users, verified by
-- signInWithPassword()).
ALTER TABLE customers ADD COLUMN IF NOT EXISTS portal_pin text;
