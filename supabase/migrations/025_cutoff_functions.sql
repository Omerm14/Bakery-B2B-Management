-- Order-edit cutoff enforcement.
--
-- CONFIRMED rule (client's own wording): "customer can change tomorrow's
-- order until 10:30am on days Sun-Thu" + "Friday/Saturday/Sunday orders
-- can be updated until Thursday 10:30am" -> Mon-Fri delivery dates lock at
-- 10:30am the day before; Saturday and Sunday deliveries both lock
-- together at the *same* Thursday 10:30am (there's no edit window on
-- Friday/Saturday to handle them separately).
--
-- The lock time itself (currently 10:30, from app_config.cutoff_rules) is
-- easy to change without touching this function; only the day-mapping
-- logic below needs a code change if the rule itself changes.
--
-- Superseded by migration 032: the original version of this function
-- below builds a naive `timestamp` and lets it implicitly cast to
-- timestamptz using the database's session TimeZone setting (UTC on
-- Supabase) when compared against now() -- meaning "10:30" here meant
-- 10:30 UTC, not 10:30 Israel time. Migration 032 replaces this with an
-- explicit `AT TIME ZONE 'Asia/Jerusalem'` conversion so the cutoff is
-- always 10:30 Israel wall-clock time regardless of server timezone or
-- DST. Left as-is here for history; do not re-apply this version.
CREATE OR REPLACE FUNCTION order_edit_lock_at(p_delivery_date date) RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  SELECT (
    CASE extract(dow FROM p_delivery_date)::int
      WHEN 0 THEN p_delivery_date - 3  -- Sunday delivery -> preceding Thursday
      WHEN 6 THEN p_delivery_date - 2  -- Saturday delivery -> preceding Thursday
      ELSE p_delivery_date - 1         -- Mon-Fri delivery -> the day before
    END
  )::timestamp + (SELECT (value ->> 'lock_time')::time FROM app_config WHERE key = 'cutoff_rules')
$$;

CREATE OR REPLACE FUNCTION customer_can_edit_delivery_date(p_delivery_date date) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT now() < order_edit_lock_at(p_delivery_date)
$$;

-- Frontend-callable wrapper (same logic) so the portal UI can check
-- editability per visible day before rendering the grid, without
-- duplicating the rule in JS.
CREATE OR REPLACE FUNCTION can_edit_delivery_date(p_delivery_date date) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT customer_can_edit_delivery_date(p_delivery_date)
$$;
GRANT EXECUTE ON FUNCTION can_edit_delivery_date(date) TO authenticated;

-- Customer write access to their own order_lines, gated by the cutoff
-- rule as a hard backstop (defense-in-depth alongside the frontend's
-- proactive can_edit_delivery_date() check). No delete policy: a removed
-- line is represented as quantity=0, same convention the staff grid uses.
CREATE POLICY "customer_insert_own" ON order_lines FOR INSERT TO authenticated
  WITH CHECK (customer_id = current_customer_id() AND customer_can_edit_delivery_date(delivery_date));

CREATE POLICY "customer_update_own" ON order_lines FOR UPDATE TO authenticated
  USING (customer_id = current_customer_id())
  WITH CHECK (customer_id = current_customer_id() AND customer_can_edit_delivery_date(delivery_date));
