-- Wednesday auto-copy: pre-fill next week's orders from this week's, for
-- every active customer, then kick off the WhatsApp reminder step.
--
-- Requires the `pg_cron` and `pg_net` extensions enabled in the project
-- (Database -> Extensions in the Supabase dashboard) and an
-- `edge_functions_base_url` value in app_config plus a Vault secret the
-- Edge Function call can authenticate with — see the deployment checklist
-- in the plan doc. This migration does NOT fail if those extensions
-- aren't enabled yet; it just skips scheduling and logs a NOTICE, so it's
-- safe to run before that setup is complete.

INSERT INTO app_config (key, value) VALUES
  ('edge_functions_base_url', '""')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION run_weekly_rollover() RETURNS void
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_this_week_start date := current_date - extract(dow FROM current_date)::int;
  v_next_week_start date := v_this_week_start + 7;
  v_this_week_id uuid;
  v_next_week_id uuid;
  v_base_url text;
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

  -- Kick off the reminder-sending Edge Function. Left as a best-effort
  -- call: if pg_net isn't set up yet, this raises a NOTICE rather than
  -- failing the whole rollover (the order-copying above already
  -- committed by this point in the function... note this function is not
  -- wrapped in an explicit transaction beyond Postgres's own statement
  -- atomicity, so a failure here does not undo the copy above).
  BEGIN
    SELECT (value #>> '{}') INTO v_base_url FROM app_config WHERE key = 'edge_functions_base_url';
    IF v_base_url IS NOT NULL AND v_base_url <> '' THEN
      -- The Edge Function checks this header against its own
      -- CRON_EDGE_SECRET so send-weekly-reminders can't be triggered by
      -- an arbitrary caller who finds the URL. Create the Vault secret
      -- named 'cron_edge_function_secret' with the same value as of
      -- deploy time (see the plan doc's deployment checklist).
      PERFORM net.http_post(
        url := v_base_url || '/send-weekly-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_edge_function_secret')
        ),
        body := jsonb_build_object('week_id', v_next_week_id)
      );
    ELSE
      RAISE NOTICE 'run_weekly_rollover: app_config.edge_functions_base_url is not set, skipping reminder call';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'run_weekly_rollover: failed to call send-weekly-reminders: %', SQLERRM;
  END;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-auto-copy-and-remind') THEN
      PERFORM cron.unschedule('weekly-auto-copy-and-remind');
    END IF;
    -- 8:00 UTC ~= 10:00/11:00 Israel time depending on DST -- confirm the
    -- exact desired local fire time and adjust before relying on this.
    PERFORM cron.schedule('weekly-auto-copy-and-remind', '0 8 * * 3', 'select run_weekly_rollover()');
  ELSE
    RAISE NOTICE 'pg_cron extension not enabled -- run `select cron.schedule(...)` manually once it is (see migration source for the exact call).';
  END IF;
END $$;
