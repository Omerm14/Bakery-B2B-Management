-- Make the order-edit cutoff configurable per delivery day, from the staff
-- Settings screen, instead of a hardcoded day-mapping in this function.
--
-- NEW rule the client asked for, seeded below as the default: Thursday,
-- Friday, Saturday and the following Sunday -- four consecutive delivery
-- days -- all close together at the Wednesday 10:30 that precedes them,
-- instead of Friday/Saturday/Sunday closing on Thursday 10:30. Mon-Thu are
-- unchanged (the day before at 10:30).
--
-- Supersedes the CASE day-mapping in migrations 025 and 032. The shape is
-- now app_config.cutoff_rules -> 'per_day' -> '<dow>' = {offset_days, time},
-- where dow is extract(dow) (0 = Sunday). 'lock_time' is kept as the
-- fallback for any day the object is missing, so a partial or absent
-- 'per_day' degrades to "the day before at 10:30" rather than to NULL --
-- a NULL here would make customer_can_edit_delivery_date() false-y and
-- silently lock (or, read the other way, unlock) every day at once.

UPDATE app_config
SET value = value || jsonb_build_object('per_day', jsonb_build_object(
      '0', jsonb_build_object('offset_days', 4, 'time', '10:30'),  -- ראשון  -> preceding Wednesday
      '1', jsonb_build_object('offset_days', 1, 'time', '10:30'),  -- שני    -> Sunday
      '2', jsonb_build_object('offset_days', 1, 'time', '10:30'),  -- שלישי  -> Monday
      '3', jsonb_build_object('offset_days', 1, 'time', '10:30'),  -- רביעי  -> Tuesday
      '4', jsonb_build_object('offset_days', 1, 'time', '10:30'),  -- חמישי  -> Wednesday
      '5', jsonb_build_object('offset_days', 2, 'time', '10:30'),  -- שישי   -> Wednesday
      '6', jsonb_build_object('offset_days', 3, 'time', '10:30')   -- שבת    -> Wednesday
    )),
    updated_at = now()
WHERE key = 'cutoff_rules';

-- CREATE OR REPLACE swaps the whole body, so the `AT TIME ZONE
-- 'Asia/Jerusalem'` conversion migration 032 added is restated here
-- verbatim -- without it "10:30" is enforced at 10:30 UTC (12:30/13:30
-- Israel time depending on DST), which is the bug 032 fixed.
CREATE OR REPLACE FUNCTION order_edit_lock_at(p_delivery_date date) RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  WITH cfg AS (
    SELECT value FROM app_config WHERE key = 'cutoff_rules'
  ), day_rule AS (
    SELECT value -> 'per_day' -> extract(dow FROM p_delivery_date)::int::text AS rule FROM cfg
  )
  SELECT (
    (p_delivery_date - coalesce((SELECT (rule ->> 'offset_days')::int FROM day_rule), 1))::timestamp
    + coalesce(
        (SELECT (rule ->> 'time')::time FROM day_rule),
        (SELECT (value ->> 'lock_time')::time FROM cfg),
        '10:30'::time
      )
  ) AT TIME ZONE 'Asia/Jerusalem'
$$;
