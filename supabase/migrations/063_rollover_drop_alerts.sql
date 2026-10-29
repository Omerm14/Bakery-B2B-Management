-- Alert staff when the Wednesday auto-copy leaves a product out.
--
-- The one-time bug fixed in migration 062 ran for two weeks before anyone
-- noticed, because nothing compares next week to this week — a customer
-- calling about a missing delivery was the first signal. This check runs
-- right after the rollover and records, per customer, every product that
-- should have been copied into next week but has no line there at all.
--
-- "Should have been copied" is the copy-forward rule written out on its own
-- (not by calling the rollover), so a future change that breaks the rollover,
-- or the cron job not running at all, shows up here instead of at delivery:
-- active customer with auto_sync, active item, and a quantity to carry > 0
-- (the line's quantity, or for a one-time line its regular quantity).
-- A cell that has ANY row next week is never flagged — someone (the rollover,
-- the customer or staff) already decided its value.

CREATE TABLE IF NOT EXISTS rollover_drop_alerts (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references customers(id) on delete cascade,
  week_id           uuid not null references weeks(id) on delete cascade,
  menu_item_id      uuid not null references menu_items(id) on delete cascade,
  delivery_date     date not null,
  expected_quantity numeric(10,2) not null,
  created_at        timestamptz not null default now(),
  seen_at           timestamptz,
  seen_by           text,
  UNIQUE (customer_id, menu_item_id, delivery_date)
);

CREATE INDEX IF NOT EXISTS rollover_drop_alerts_unseen_idx
  ON rollover_drop_alerts (created_at) WHERE seen_at IS NULL;

ALTER TABLE rollover_drop_alerts ENABLE ROW LEVEL SECURITY;

-- Staff-only inbox, same as order_change_notifications (migration 036).
DROP POLICY IF EXISTS "staff_all" ON rollover_drop_alerts;
CREATE POLICY "staff_all" ON rollover_drop_alerts FOR ALL TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());

-- Same week math as run_weekly_rollover(): "this week" is the week being
-- copied from, next week the one being filled. Returns how many new alerts
-- were recorded; re-running is safe (one alert per cell, ever).
CREATE OR REPLACE FUNCTION check_rollover_drops() RETURNS integer
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_this_week_start date := current_date - extract(dow FROM current_date)::int;
  v_this_week_id uuid;
  v_next_week_id uuid;
  v_count integer;
BEGIN
  SELECT id INTO v_this_week_id FROM weeks WHERE start_date = v_this_week_start;
  IF v_this_week_id IS NULL THEN
    RETURN 0;
  END IF;
  SELECT id INTO v_next_week_id FROM weeks WHERE start_date = v_this_week_start + 7;

  WITH expected AS (
    SELECT ol.customer_id, ol.menu_item_id, ol.delivery_date + 7 AS delivery_date,
      CASE WHEN ol.no_carry_forward THEN COALESCE(ol.carry_forward_quantity, 0)
           ELSE ol.quantity END AS quantity
    FROM order_lines ol
    JOIN customers c ON c.id = ol.customer_id
    JOIN menu_items mi ON mi.id = ol.menu_item_id
    WHERE ol.week_id = v_this_week_id
      AND c.active AND c.auto_sync AND mi.active
  ),
  inserted AS (
    -- No next-week row at all (v_next_week_id NULL) means the rollover never
    -- ran: every expected cell is missing. The alert then points at this
    -- week, the only week row there is.
    INSERT INTO rollover_drop_alerts (customer_id, week_id, menu_item_id, delivery_date, expected_quantity)
    SELECT e.customer_id, COALESCE(v_next_week_id, v_this_week_id), e.menu_item_id, e.delivery_date, e.quantity
    FROM expected e
    WHERE e.quantity > 0
      AND NOT EXISTS (
        SELECT 1 FROM order_lines x
        WHERE x.customer_id = e.customer_id AND x.menu_item_id = e.menu_item_id
          AND x.delivery_date = e.delivery_date)
    ON CONFLICT (customer_id, menu_item_id, delivery_date) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM inserted;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Half an hour after the rollover (03:00 UTC, migration 032/054). Guarded so
-- the migration also applies where pg_cron isn't installed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rollover-drop-check') THEN
      PERFORM cron.unschedule('rollover-drop-check');
    END IF;
    PERFORM cron.schedule('rollover-drop-check', '30 3 * * 3', 'select check_rollover_drops()');
  END IF;
END $$;
