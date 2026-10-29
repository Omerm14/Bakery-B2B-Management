-- A one-time change applies to its week only: next week gets the regular
-- quantity back (migration 062), never an empty cell.
DO $$
DECLARE
  c uuid := test.customer('one-time');
  up uuid := test.item('up'); up_again uuid := test.item('up twice'); zero uuid := test.item('zeroed');
  fresh uuid := test.item('new one-time'); perm uuid := test.item('permanent');
  back uuid := test.item('back to permanent'); upsert uuid := test.item('upsert');
  l uuid;
BEGIN
  -- 12 -> 15 one-time
  l := test.line(c, up, 12);
  UPDATE order_lines SET quantity = 15, no_carry_forward = true WHERE id = l;
  PERFORM test.eq((SELECT carry_forward_quantity FROM order_lines WHERE id = l), 12::numeric, 'flag on keeps the regular qty');

  -- 12 -> 15 one-time -> 18 still one-time: regular stays 12
  l := test.line(c, up_again, 12);
  UPDATE order_lines SET quantity = 15, no_carry_forward = true WHERE id = l;
  UPDATE order_lines SET quantity = 18 WHERE id = l;
  PERFORM test.eq((SELECT carry_forward_quantity FROM order_lines WHERE id = l), 12::numeric, 're-editing a one-time line keeps the regular qty');

  -- 12 -> 0 one-time
  l := test.line(c, zero, 12);
  UPDATE order_lines SET quantity = 0, no_carry_forward = true WHERE id = l;

  -- brand-new one-time line
  INSERT INTO order_lines (week_id, customer_id, menu_item_id, delivery_date, quantity, source, status, no_carry_forward)
  VALUES (test.week(test.this_week()), c, fresh, test.this_week() + 1, 5, 'manual', 'ok', true)
  RETURNING id INTO l;
  PERFORM test.eq((SELECT carry_forward_quantity FROM order_lines WHERE id = l), 0::numeric, 'new one-time line has regular qty 0');

  -- 12 -> 15 permanent
  l := test.line(c, perm, 12);
  UPDATE order_lines SET quantity = 15 WHERE id = l;

  -- 12 -> 15 one-time, then switched to permanent
  l := test.line(c, back, 12);
  UPDATE order_lines SET quantity = 15, no_carry_forward = true WHERE id = l;
  UPDATE order_lines SET no_carry_forward = false WHERE id = l;
  PERFORM test.eq((SELECT carry_forward_quantity FROM order_lines WHERE id = l), NULL::numeric, 'permanent line clears the regular qty');

  -- 10 -> 7 one-time through an upsert, the way the staff grid and portal write
  PERFORM test.line(c, upsert, 10);
  INSERT INTO order_lines (week_id, customer_id, menu_item_id, delivery_date, quantity, source, status, no_carry_forward)
  VALUES (test.week(test.this_week()), c, upsert, test.this_week() + 1, 7, 'manual', 'ok', true)
  ON CONFLICT (week_id, customer_id, menu_item_id, delivery_date)
  DO UPDATE SET quantity = EXCLUDED.quantity, no_carry_forward = EXCLUDED.no_carry_forward;

  PERFORM run_weekly_rollover();

  PERFORM test.eq(test.next_qty(c, up), 12::numeric, '12 -> 15 one-time returns to 12');
  PERFORM test.eq(test.next_qty(c, up_again), 12::numeric, '12 -> 15 -> 18 one-time returns to 12');
  PERFORM test.eq(test.next_qty(c, zero), 12::numeric, '12 -> 0 one-time returns to 12');
  PERFORM test.eq(test.next_qty(c, fresh), NULL::numeric, 'new one-time item does not repeat');
  PERFORM test.eq(test.next_qty(c, perm), 15::numeric, 'permanent change repeats');
  PERFORM test.eq(test.next_qty(c, back), 15::numeric, 'one-time switched to permanent repeats');
  PERFORM test.eq(test.next_qty(c, upsert), 10::numeric, 'one-time via upsert returns to 10');
  PERFORM test.eq((SELECT no_carry_forward FROM order_lines
                   WHERE customer_id = c AND menu_item_id = up AND delivery_date = test.this_week() + 8),
                  false, 'copied line is permanent again');
END $$;
