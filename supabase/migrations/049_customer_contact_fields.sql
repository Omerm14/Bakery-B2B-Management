-- Adds Contact Person and Email to customers, edited via the new "Edit
-- Customer" modal in Settings (src/pages/Settings.jsx). Nullable/free text,
-- same convention as the existing name_en column (migration 042).
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS email text;
