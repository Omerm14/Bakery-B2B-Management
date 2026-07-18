-- Multi-tenant SaaS foundation, step 7: cutoff rule reads from `organizations`.
--
-- order_edit_lock_at() (migrations 025/032) read the lock time from
-- app_config.cutoff_rules and hardcoded 'Asia/Jerusalem' as the timezone —
-- both are genuinely per-org settings now (organizations.cutoff_lock_time,
-- organizations.timezone, migration 055). Resolves the org via
-- current_organization_id() — works for both staff and customer sessions,
-- same function used everywhere else in this design. customer_can_edit_delivery_date()/
-- can_edit_delivery_date()/get_delivery_date_lock_at() (unchanged below —
-- they just wrap this function) inherit the fix automatically.
CREATE OR REPLACE FUNCTION order_edit_lock_at(p_delivery_date date) RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  SELECT (
    (
      CASE extract(dow FROM p_delivery_date)::int
        WHEN 0 THEN p_delivery_date - 3  -- Sunday delivery -> preceding Thursday
        WHEN 6 THEN p_delivery_date - 2  -- Saturday delivery -> preceding Thursday
        ELSE p_delivery_date - 1         -- Mon-Fri delivery -> the day before
      END
    )::timestamp + (SELECT cutoff_lock_time FROM organizations WHERE id = current_organization_id())
  ) AT TIME ZONE (SELECT timezone FROM organizations WHERE id = current_organization_id())
$$;
