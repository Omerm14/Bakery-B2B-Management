-- check_rollover_drops() (migration 063) flags products the rollover should
-- have carried into next week but didn't — and nothing else.
DO $$
DECLARE
  c uuid := test.customer('alerts');
  off uuid := test.customer('auto-sync off', true, false);
  bread uuid := test.item('bread'); rolls uuid := test.item('rolls'); cake uuid := test.item('cake');
  l uuid;
BEGIN
  PERFORM test.line(c, bread, 12);
  l := test.line(c, rolls, 8);
  UPDATE order_lines SET quantity = 2, no_carry_forward = true WHERE id = l;  -- one-time, regular 8
  INSERT INTO order_lines (week_id, customer_id, menu_item_id, delivery_date, quantity, source, status, no_carry_forward)
  VALUES (test.week(test.this_week()), c, cake, test.this_week() + 1, 5, 'manual', 'ok', true);  -- new one-time
  PERFORM test.line(off, bread, 9);

  -- The rollover never ran: everything expected is missing.
  PERFORM test.eq(check_rollover_drops(), 2, 'no rollover: bread and the one-time rolls are missing');
  PERFORM test.eq((SELECT expected_quantity FROM rollover_drop_alerts WHERE customer_id = c AND menu_item_id = rolls),
                  8::numeric, 'one-time line is expected back at its regular qty');
  DELETE FROM rollover_drop_alerts;

  -- A correct rollover leaves nothing to report.
  PERFORM run_weekly_rollover();
  PERFORM test.eq(check_rollover_drops(), 0, 'nothing missing after a correct rollover');

  -- A product missing next week is reported once.
  DELETE FROM order_lines WHERE customer_id = c AND menu_item_id = bread AND delivery_date = test.this_week() + 8;
  PERFORM test.eq(check_rollover_drops(), 1, 'missing product is reported');
  PERFORM test.eq(check_rollover_drops(), 0, 're-running does not duplicate the alert');
  PERFORM test.eq((SELECT expected_quantity FROM rollover_drop_alerts WHERE customer_id = c AND menu_item_id = bread),
                  12::numeric, 'alert carries the expected quantity');
  PERFORM test.eq((SELECT w.start_date FROM rollover_drop_alerts a JOIN weeks w ON w.id = a.week_id
                   WHERE a.customer_id = c AND a.menu_item_id = bread),
                  test.this_week() + 7, 'alert points at next week');

  -- A cell someone deliberately set to 0 next week is a decision, not a drop.
  DELETE FROM rollover_drop_alerts;
  INSERT INTO order_lines (week_id, customer_id, menu_item_id, delivery_date, quantity, source, status)
  VALUES (test.week(test.this_week() + 7), c, bread, test.this_week() + 8, 0, 'manual', 'ok');
  PERFORM test.eq(check_rollover_drops(), 0, 'zeroed cell next week is not a drop');
END $$;

-- The check runs on its own schedule, right after the rollover.
DO $$
BEGIN
  PERFORM test.eq((SELECT schedule FROM cron.job WHERE jobname = 'weekly-auto-copy'), '0 3 * * 3', 'rollover scheduled Wednesday 03:00 UTC');
  PERFORM test.eq((SELECT schedule FROM cron.job WHERE jobname = 'rollover-drop-check'), '30 3 * * 3', 'drop check scheduled 30 min after');
END $$;
