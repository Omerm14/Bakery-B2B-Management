-- Wednesday auto-copy: pre-fill next week's orders from this week's, for
-- every active customer. Pure SQL — no messaging/notification of any kind
-- is sent; customers simply see next week pre-filled next time they log in.
--
-- Requires the `pg_cron` extension enabled in the project (Database ->
-- Extensions in the Supabase dashboard). This migration does NOT fail if
-- it isn't enabled yet; it just skips scheduling and logs a NOTICE, so
-- it's safe to run before that setup is complete.

CREATE OR REPLACE FUNCTION run_weekly_rollover() RETURNS void
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_this_week_start date := current_date - extract(dow FROM current_date)::int;
  v_next_week_start date := v_this_week_start + 7;
  v_this_week_id uuid;
  v_next_week_id uuid;
BEGIN
  SELECT id INTO v_this_week_id FROM weeks WHERE start_date = v_this_week_start;
  IF v_this_week_id IS NULL THEN
    RAISE NOTICE 'run_weekly_rollover: no week row for %, nothing to copy', v_this_week_start;
    RETURN;
  END IF;

  INSERT INTO weeks (start_date, label)
  VALUES (v_next_week_start, 'שבוע ' || to_char(v_next_week_start, 'DD/MM/YYYY'))
  ON CONFLICT (start_date) DO NOTHING
  RETURNING id INTO v_next_week_id;

  IF v_next_week_id IS NULL THEN
    SELECT id INTO v_next_week_id FROM weeks WHERE start_date = v_next_week_start;
  END IF;

  INSERT INTO order_lines (week_id, customer_id, menu_item_id, delivery_date, quantity,
    source, status, change_reason, change_note, changed_by, changed_via, updated_at)
  SELECT v_next_week_id, ol.customer_id, ol.menu_item_id, ol.delivery_date + 7, ol.quantity,
    'manual', 'ok', 'auto_copy', 'הועתק אוטומטית ע"י המערכת ביום רביעי', 'system:weekly_rollover',
    'auto_copy_weekly', now()
  FROM order_lines ol
  JOIN customers c ON c.id = ol.customer_id AND c.active
  WHERE ol.week_id = v_this_week_id AND ol.quantity > 0
  ON CONFLICT (week_id, customer_id, menu_item_id, delivery_date) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-auto-copy') THEN
      PERFORM cron.unschedule('weekly-auto-copy');
    END IF;
    -- 8:00 UTC ~= 10:00/11:00 Israel time depending on DST -- confirm the
    -- exact desired local fire time and adjust before relying on this.
    PERFORM cron.schedule('weekly-auto-copy', '0 8 * * 3', 'select run_weekly_rollover()');
  ELSE
    RAISE NOTICE 'pg_cron extension not enabled -- run `select cron.schedule(...)` manually once it is (see migration source for the exact call).';
  END IF;
END $$;
