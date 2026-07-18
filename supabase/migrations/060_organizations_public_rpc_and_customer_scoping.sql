-- Multi-tenant SaaS foundation, step 6: public org lookup + org-scoped
-- customer auth RPCs.
--
-- The customer portal now needs to know which bakery it's serving BEFORE
-- login (path-based org slug, e.g. /portal/jorno/login — see plan §6),
-- both to show the right branding and because a phone number is only
-- unique WITHIN one org's customer list, not globally (two different
-- bakery clients could each have a wholesale customer with the same phone
-- number). `organizations` itself has no public RLS policy (migration
-- 055), so pre-login access goes through this narrow SECURITY DEFINER
-- RPC instead — deliberately excludes `cutoff_lock_time`: nothing
-- pre-login needs it (the post-login cutoff countdown already resolves it
-- server-side via current_organization_id(), no signature change needed
-- there).
CREATE OR REPLACE FUNCTION get_organization_public_info(p_slug text)
RETURNS TABLE (
  id                              uuid,
  name                            text,
  business_name                   text,
  logo_url                        text,
  support_contact_name            text,
  support_contact_phone           text,
  support_contact_whatsapp_link   text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT id, name, business_name, logo_url, support_contact_name, support_contact_phone, support_contact_whatsapp_link
  FROM organizations
  WHERE slug = p_slug AND active = true
$$;
GRANT EXECUTE ON FUNCTION get_organization_public_info(text) TO anon, authenticated;

-- get_customer_auth_email(p_phone) (migration 022) and
-- get_customer_display_name(p_phone) (migration 034) were both keyed by
-- phone alone — exactly the collision risk above. Drop the old
-- single-arg signatures (not left as dead overloads — nothing should call
-- them once the frontend moves to the org-scoped versions) and replace
-- with versions scoped to one organization via its slug.
DROP FUNCTION IF EXISTS get_customer_auth_email(text);
CREATE FUNCTION get_customer_auth_email(p_org_slug text, p_phone text) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT c.auth_email
  FROM customers c
  JOIN organizations o ON o.id = c.organization_id
  WHERE o.slug = p_org_slug AND o.active = true
    AND c.phone = p_phone AND c.active = true AND c.auth_email IS NOT NULL
$$;
GRANT EXECUTE ON FUNCTION get_customer_auth_email(text, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS get_customer_display_name(text);
CREATE FUNCTION get_customer_display_name(p_org_slug text, p_phone text) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT c.name
  FROM customers c
  JOIN organizations o ON o.id = c.organization_id
  WHERE o.slug = p_org_slug AND o.active = true
    AND c.phone = p_phone AND c.active = true
$$;
GRANT EXECUTE ON FUNCTION get_customer_display_name(text, text) TO anon, authenticated;

-- Post-login sibling of get_organization_public_info: CutoffBlockedNotice.jsx
-- (shown to an already-authenticated customer past the edit cutoff) needs
-- the org's support contact, but has no org slug handy and no direct SELECT
-- access to `organizations` (staff/super-admin-only RLS, migration 055) —
-- resolves via current_organization_id() instead, which works identically
-- for both staff and customer sessions.
CREATE OR REPLACE FUNCTION get_own_organization_support_contact()
RETURNS TABLE (support_contact_name text, support_contact_phone text, support_contact_whatsapp_link text)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT support_contact_name, support_contact_phone, support_contact_whatsapp_link
  FROM organizations WHERE id = current_organization_id()
$$;
GRANT EXECUTE ON FUNCTION get_own_organization_support_contact() TO authenticated;

-- Two pre-existing SECURITY DEFINER functions bypass RLS entirely and had
-- no tenant awareness before this migration — both are real cross-org
-- leaks/writes once a second org's data exists, not just theoretical:
--
-- get_active_menu_items() (migrations 024/047/048) returned EVERY active
-- menu item across ALL organizations to any authenticated customer
-- session — a Jorno customer's order screen would show Urban Bakery's
-- entire catalog too. Scope it to the calling customer's own org.
CREATE OR REPLACE FUNCTION get_active_menu_items()
RETURNS TABLE (
  id uuid,
  name_he text,
  name_en text,
  unit text,
  category text,
  price numeric,
  is_favorite boolean
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT mi.id, mi.name_he, mi.name_en, mi.unit, mi.category,
         CASE WHEN mi.price_visible_to_customers THEN mi.price ELSE null END AS price,
         (cfi.menu_item_id IS NOT NULL) AS is_favorite
  FROM menu_items mi
  LEFT JOIN customer_favorite_items cfi
    ON cfi.menu_item_id = mi.id AND cfi.customer_id = current_customer_id()
  WHERE mi.active = true AND mi.organization_id = current_organization_id()
$$;

-- seed_favorite_items_from_history() (migration 043) is staff-gated
-- (is_staff()) but had no org filter at all — staff of ANY org clicking
-- "Seed favorites from history" in Settings would pool every org's recent
-- weeks/order_lines together and write customer_favorite_items rows for
-- customers belonging to OTHER organizations. Scope every CTE to the
-- calling staff member's own org (or the super-admin's currently-acting-as
-- org, via current_organization_id() same as everywhere else).
CREATE OR REPLACE FUNCTION seed_favorite_items_from_history(p_min_weeks int DEFAULT 3, p_lookback_weeks int DEFAULT 8)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
  v_org_id uuid := current_organization_id();
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'staff access required';
  END IF;

  WITH recent_weeks AS (
    SELECT id FROM weeks WHERE organization_id = v_org_id AND start_date <= CURRENT_DATE ORDER BY start_date DESC LIMIT p_lookback_weeks
  ),
  frequency AS (
    SELECT ol.customer_id, ol.menu_item_id, COUNT(DISTINCT ol.week_id) AS weeks_ordered
    FROM order_lines ol
    JOIN recent_weeks rw ON rw.id = ol.week_id
    WHERE ol.quantity > 0 AND ol.organization_id = v_org_id
    GROUP BY ol.customer_id, ol.menu_item_id
    HAVING COUNT(DISTINCT ol.week_id) >= p_min_weeks
  ),
  inserted AS (
    INSERT INTO customer_favorite_items (customer_id, menu_item_id)
    SELECT customer_id, menu_item_id FROM frequency
    ON CONFLICT (customer_id, menu_item_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM inserted;

  RETURN v_count;
END;
$$;
