-- Public lookup (no session required) resolving an active customer's
-- phone number to their display name, so the login screen can show a
-- personalized "שלום, {name}!" greeting once the phone is pre-filled from
-- the shared link — same risk profile as get_customer_auth_email() from
-- migration 022: the phone is already embedded in the link staff share
-- with that specific customer, so returning their own name back to them
-- reveals nothing they don't already know. Returns null for an
-- unknown/inactive phone, same as get_customer_auth_email().
CREATE OR REPLACE FUNCTION get_customer_display_name(p_phone text) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT name FROM customers WHERE phone = p_phone AND active = true
$$;
GRANT EXECUTE ON FUNCTION get_customer_display_name(text) TO anon, authenticated;
