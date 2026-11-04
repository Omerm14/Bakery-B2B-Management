-- A line's delivery_date must sit inside its week (migration 070), and a
-- stray line written before the guard existed is never copied forward.
DO $$
DECLARE
  c uuid := test.customer('gazeti');
  bread uuid := test.item('country sourdough');
  this_wk uuid := test.week(test.this_week());
  next_wk uuid := test.week(test.this_week() + 7);
  stray uuid;
  rejected boolean;
BEGIN
  -- The 2026-08-21 portal write: next week's id, this week's Thursday.
  rejected := false;
  BEGIN
    INSERT INTO order_lines (week_id, customer_id, menu_item_id, delivery_date, quantity, source, status)
    VALUES (next_wk, c, bread, test.this_week() + 4, 3, 'manual', 'ok');
  EXCEPTION WHEN check_violation THEN rejected := true;
  END;
  PERFORM test.eq(rejected, true, 'rejects a date before its week');

  rejected := false;
  BEGIN
    INSERT INTO order_lines (week_id, customer_id, menu_item_id, delivery_date, quantity, source, status)
    VALUES (this_wk, c, bread, test.this_week() + 7, 3, 'manual', 'ok');
  EXCEPTION WHEN check_violation THEN rejected := true;
  END;
  PERFORM test.eq(rejected, true, 'rejects a date after its week');

  -- Both edges of the week are fine.
  INSERT INTO order_lines (week_id, customer_id, menu_item_id, delivery_date, quantity, source, status)
  VALUES (this_wk, c, bread, test.this_week(), 1, 'manual', 'ok'),
         (this_wk, c, bread, test.this_week() + 6, 1, 'manual', 'ok');

  -- Moving a line out of its week is rejected too.
  rejected := false;
  BEGIN
    UPDATE order_lines SET delivery_date = test.this_week() + 7
    WHERE customer_id = c AND delivery_date = test.this_week();
  EXCEPTION WHEN check_violation THEN rejected := true;
  END;
  PERFORM test.eq(rejected, true, 'rejects moving a line out of its week');

  -- A stray line from before the guard (this week's id, last week's date).
  ALTER TABLE order_lines DISABLE TRIGGER trg_reject_order_line_outside_week;
  INSERT INTO order_lines (week_id, customer_id, menu_item_id, delivery_date, quantity, source, status)
  VALUES (this_wk, c, bread, test.this_week() - 2, 4, 'manual', 'ok')
  RETURNING id INTO stray;
  ALTER TABLE order_lines ENABLE TRIGGER trg_reject_order_line_outside_week;

  -- Editing its quantity still works (the guard only watches week/date).
  UPDATE order_lines SET quantity = 5 WHERE id = stray;
  PERFORM test.eq((SELECT quantity FROM order_lines WHERE id = stray), 5::numeric, 'stray line stays editable');

  -- A real Thursday line next to it.
  PERFORM test.line(c, bread, 8, 3);

  PERFORM run_weekly_rollover();

  PERFORM test.eq(test.next_qty(c, bread, 3), 8::numeric, 'real line is copied');
  PERFORM test.eq(
    (SELECT count(*) FROM order_lines WHERE week_id = next_wk
       AND delivery_date NOT BETWEEN test.this_week() + 7 AND test.this_week() + 13)::int,
    0, 'stray line is not copied forward');
  PERFORM test.eq(
    (SELECT count(*) FROM order_lines WHERE customer_id = c AND delivery_date = test.this_week() + 5)::int,
    0, 'no new line on the stray line''s date + 7');

  -- Nor is it "expected" by the drop check.
  DELETE FROM order_lines WHERE week_id = next_wk;
  PERFORM check_rollover_drops();
  PERFORM test.eq(
    (SELECT count(*) FROM rollover_drop_alerts WHERE customer_id = c AND delivery_date = test.this_week() + 5)::int,
    0, 'drop check ignores the stray line');
  PERFORM test.eq(
    (SELECT count(*) FROM rollover_drop_alerts WHERE customer_id = c AND delivery_date = test.this_week() + 11)::int,
    1, 'drop check still flags the real line');
END $$;
