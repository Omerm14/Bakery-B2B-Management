-- Mass deletes / zeroing and item deactivations (migration 066).
DO $$
DECLARE
  cs uuid[] := '{}';
  bagel uuid := test.item('בגט'); old uuid := test.item('עוגה ישנה');
  t0 timestamptz := now() - interval '1 second';
  msgs text;
  i int;
BEGIN
  FOR i IN 1..6 LOOP
    cs := cs || test.customer('לקוח ' || i);
    PERFORM test.line(cs[i], bagel, 10, 8);   -- next week
    PERFORM test.line(cs[i], old, 4, 9);
  END LOOP;

  -- Five lines deleted by one person: under both thresholds.
  PERFORM set_config('request.jwt.claims', '{"email":"staff@bakery.test"}', true);
  DELETE FROM order_lines WHERE menu_item_id = bagel AND customer_id = ANY (cs[1:4]);
  PERFORM test.eq((SELECT count(*) FROM mass_change_messages(t0, now() + interval '1 second') WHERE dedupe_key LIKE 'bulk:%')::int,
                  0, '4 lines / 4 customers is not mass');

  DELETE FROM order_lines WHERE menu_item_id = bagel;   -- 2 more: now 6 lines, 6 customers
  SELECT string_agg(message, ' | ') INTO msgs FROM mass_change_messages(t0, now() + interval '1 second') WHERE dedupe_key LIKE 'bulk:%';
  PERFORM test.eq(msgs LIKE '⚠️ מחיקה / איפוס המוני של הזמנות%staff@bakery.test — 6 שורות אצל 6 לקוחות%6 נמחקו · 0 אופסו%', true,
                  '5+ customers is mass: ' || COALESCE(msgs, '<none>'));

  -- Deactivating an item clears every future line of it (migration 061).
  UPDATE menu_items SET active = false WHERE id = old;
  SELECT message INTO msgs FROM mass_change_messages(t0, now() + interval '1 second') WHERE dedupe_key LIKE 'deactivate:%';
  PERFORM test.eq(msgs LIKE '⚠️ מוצר הושבת: עוגה ישנה%אופסו 6 שורות הזמנה אצל 6 לקוחות%', true, 'deactivation is reported: ' || COALESCE(msgs, '<none>'));

  PERFORM test.eq((SELECT count(*) FROM mass_change_messages(now() + interval '1 second', now() + interval '2 seconds'))::int,
                  0, 'nothing outside the window');
  PERFORM test.eq(run_owner_monitor(), 0, 'unconfigured Telegram sends nothing');
  PERFORM test.eq((SELECT count(*) FROM owner_monitor_state WHERE key = 'mass_changes')::int, 0,
                  'cursor does not move past unsent alerts');
END $$;

-- Failed scheduled jobs.
DO $$
DECLARE
  msg text;
BEGIN
  INSERT INTO cron.job_run_details (jobid, runid, job_pid, database, username, command, status, return_message, start_time, end_time)
  SELECT jobid, 999001, 1, current_database(), 'postgres', command, 'failed', 'ERROR: something broke', now(), now()
  FROM cron.job WHERE jobname = 'weekly-auto-copy';
  SELECT message INTO msg FROM cron_failure_messages(now() - interval '1 minute');
  PERFORM test.eq(msg LIKE '🚨 משימה אוטומטית נכשלה: weekly-auto-copy%ERROR: something broke', true, 'failed job is reported: ' || COALESCE(msg, '<none>'));
  PERFORM test.eq((SELECT count(*) FROM cron_failure_messages(now() + interval '1 minute'))::int, 0, 'only new failures');
END $$;

-- Schedules.
DO $$
BEGIN
  PERFORM test.eq((SELECT schedule FROM cron.job WHERE jobname = 'owner-monitor'), '*/15 * * * *', 'monitor every 15 min');
  PERFORM test.eq((SELECT schedule FROM cron.job WHERE jobname = 'owner-late-changes'), '30 16 * * *', 'evening digest');
  PERFORM test.eq((SELECT schedule FROM cron.job WHERE jobname = 'owner-weekly-report'), '0 5 * * 0', 'weekly report Sunday morning');
END $$;
