-- Fix a real correctness bug in order_edit_lock_at() (migration 025): the
-- naive `date::timestamp + time` expression it built was being compared
-- against now() using the database's session TimeZone (UTC on Supabase),
-- so "10:30" actually enforced at 10:30 UTC (= 12:30 or 13:30 Israel time,
-- depending on DST) instead of 10:30 Israel time as the client's rule
-- requires. `AT TIME ZONE 'Asia/Jerusalem'` on a naive timestamp converts
-- it *from* that zone's wall-clock time to a correct timestamptz instant,
-- which is what we want here (and it follows Israel's own DST rules, so
-- no separate DST handling is needed).
CREATE OR REPLACE FUNCTION order_edit_lock_at(p_delivery_date date) RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  SELECT (
    (
      CASE extract(dow FROM p_delivery_date)::int
        WHEN 0 THEN p_delivery_date - 3  -- Sunday delivery -> preceding Thursday
        WHEN 6 THEN p_delivery_date - 2  -- Saturday delivery -> preceding Thursday
        ELSE p_delivery_date - 1         -- Mon-Fri delivery -> the day before
      END
    )::timestamp + (SELECT (value ->> 'lock_time')::time FROM app_config WHERE key = 'cutoff_rules')
  ) AT TIME ZONE 'Asia/Jerusalem'
$$;

-- Frontend-callable wrapper exposing the actual lock instant (not just a
-- boolean) so the customer portal can show a countdown ("2h 15m left to
-- edit") and derive per-day editability locally by comparing against the
-- client clock, instead of a separate RPC round-trip per day.
CREATE OR REPLACE FUNCTION get_delivery_date_lock_at(p_delivery_date date) RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  SELECT order_edit_lock_at(p_delivery_date)
$$;
GRANT EXECUTE ON FUNCTION get_delivery_date_lock_at(date) TO authenticated;

-- Move the Wednesday auto-copy earlier so it reliably finishes well
-- before the 10:30 Israel cutoff regardless of DST (the old 8:00 UTC ->
-- 10:00/11:00 Israel time landed uncomfortably close to, or after, the
-- cutoff itself in summer). 3:00 UTC -> 5:00/6:00 Israel time, safely in
-- the early morning.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-auto-copy') THEN
      PERFORM cron.unschedule('weekly-auto-copy');
    END IF;
    PERFORM cron.schedule('weekly-auto-copy', '0 3 * * 3', 'select run_weekly_rollover()');
  ELSE
    RAISE NOTICE 'pg_cron extension not enabled -- run `select cron.schedule(''weekly-auto-copy'', ''0 3 * * 3'', ''select run_weekly_rollover()'')` manually once it is.';
  END IF;
END $$;
