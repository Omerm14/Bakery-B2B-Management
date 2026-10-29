-- Who and what the Wednesday auto-copy carries forward, and what it never touches.
DO $$
DECLARE
  c uuid := test.customer('regular');
  off uuid := test.customer('auto-sync off', true, false);
  gone uuid := test.customer('inactive customer', false, true);
  bread uuid := test.item('bread'); old uuid := test.item('inactive item');
  filled uuid := test.item('already filled'); zero uuid := test.item('zero');
  n_before int;
BEGIN
  PERFORM test.line(c, bread, 12, 0);
  PERFORM test.line(c, bread, 6, 3);
  PERFORM test.line(c, old, 4);
  UPDATE menu_items SET active = false WHERE id = old;  -- zeroes future lines (061)
  PERFORM test.line(c, filled, 12);
  PERFORM test.line(c, zero, 0);
  PERFORM test.line(off, bread, 9);
  PERFORM test.line(gone, bread, 9);

  -- Someone already set next week's cell: the rollover must not overwrite it.
  INSERT INTO order_lines (week_id, customer_id, menu_item_id, delivery_date, quantity, source, status)
  VALUES (test.week(test.this_week() + 7), c, filled, test.this_week() + 8, 3, 'manual', 'ok');

  PERFORM run_weekly_rollover();

  PERFORM test.eq(test.next_qty(c, bread, 0), 12::numeric, 'copies Monday');
  PERFORM test.eq(test.next_qty(c, bread, 3), 6::numeric, 'copies Thursday to Thursday');
  PERFORM test.eq(test.next_qty(c, old), NULL::numeric, 'skips inactive item');
  PERFORM test.eq(test.next_qty(c, filled), 3::numeric, 'never overwrites an existing cell');
  PERFORM test.eq(test.next_qty(c, zero), NULL::numeric, 'does not copy zero lines');
  PERFORM test.eq(test.next_qty(off, bread), NULL::numeric, 'skips customers with auto-sync off');
  PERFORM test.eq(test.next_qty(gone, bread), NULL::numeric, 'skips inactive customers');
  PERFORM test.eq((SELECT count(*) FROM order_change_notifications WHERE customer_id = c)::int, 1, 'one notification per customer filled');

  -- Running twice (e.g. a manual re-run) changes nothing.
  SELECT count(*) INTO n_before FROM order_lines;
  PERFORM run_weekly_rollover();
  PERFORM test.eq((SELECT count(*) FROM order_lines)::int, n_before, 're-run adds no lines');
END $$;
