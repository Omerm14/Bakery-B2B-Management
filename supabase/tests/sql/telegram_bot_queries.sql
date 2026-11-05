-- Read-only reports and plumbing behind the Telegram bot (migration 067).
DO $$
DECLARE
  c uuid := test.customer('קפה ביאליק');
  other uuid := test.customer('קיוסקו');
  gone uuid := test.customer('מאפה ישן');
  bread uuid := test.item('לחם שאור');
  roll uuid := test.item('לחמניה');
  ws date := test.this_week() - 7;   -- last week (Sunday)
  r jsonb;
BEGIN
  UPDATE menu_items SET price = 10, category = 'לחמים' WHERE id = bread;
  INSERT INTO order_lines (week_id, customer_id, menu_item_id, delivery_date, quantity, source, status) VALUES
    -- week before last
    (test.week(ws - 7), c, bread, ws - 6, 8, 'manual', 'ok'),
    (test.week(ws - 7), gone, bread, ws - 6, 5, 'manual', 'ok'),
    -- last week
    (test.week(ws), c, bread, ws + 1, 10, 'manual', 'ok'),
    (test.week(ws), c, roll, ws + 1, 30, 'manual', 'ok'),
    (test.week(ws), c, bread, ws + 3, 6, 'manual', 'ok'),
    (test.week(ws), c, roll, ws + 3, 0, 'manual', 'ok'),       -- 0 = not ordered
    (test.week(ws), other, roll, ws + 3, 12, 'manual', 'ok');

  -- Name matching ignores spaces, quotes and case.
  PERFORM test.eq(bot_find_customers('ביאליק') -> 0 ->> 'name', 'קפה ביאליק', 'partial name');
  PERFORM test.eq(bot_find_customers('קפה-ביאליק') -> 0 ->> 'id', c::text, 'dash ignored');
  PERFORM test.eq(jsonb_array_length(bot_find_customers('אין כזה')), 0, 'no match');
  PERFORM test.eq((bot_find_customers('קפה ביאליק') -> 0 ->> 'last_order_date')::date, ws + 3, 'last order date');
  PERFORM test.eq(bot_find_items('שאור') -> 0 ->> 'name', 'לחם שאור', 'item match');

  r := bot_customer_report(c, ws, ws + 6);
  PERFORM test.eq(r -> 'customer' ->> 'name', 'קפה ביאליק', 'customer name');
  PERFORM test.eq((r ->> 'total_units')::numeric, 46::numeric, 'units in range');
  PERFORM test.eq((r ->> 'order_days')::int, 2, 'order days');
  PERFORM test.eq((r ->> 'distinct_items')::int, 2, 'distinct items');
  PERFORM test.eq((r ->> 'total_value')::numeric, 160::numeric, 'value of priced items only');
  PERFORM test.eq((r ->> 'items_without_price')::int, 1, 'unpriced items counted');
  PERFORM test.eq((r -> 'prev' ->> 'total_units')::numeric, 8::numeric, 'previous period');
  PERFORM test.eq(r -> 'items' -> 0 ->> 'name', 'לחמניה', 'biggest item first');
  PERFORM test.eq((r -> 'items' -> 1 ->> 'prev_qty')::numeric, 8::numeric, 'item previous qty');
  PERFORM test.eq(jsonb_array_length(r -> 'days' -> 1 -> 'items'), 1, 'zero lines left out of the day');
  PERFORM test.eq(r -> 'categories' -> 0 ->> 'category', 'ללא קטגוריה', 'categories');

  -- A single day.
  r := bot_customer_report(c, ws + 1, ws + 1);
  PERFORM test.eq((r ->> 'total_units')::numeric, 40::numeric, 'one day');
  PERFORM test.eq((r -> 'prev' ->> 'from')::date, ws, 'previous day');

  r := bot_item_report(roll, ws, ws + 6);
  PERFORM test.eq((r ->> 'total_qty')::numeric, 42::numeric, 'item total');
  PERFORM test.eq(r -> 'customers' -> 0 ->> 'customer', 'קפה ביאליק', 'top customer for item');

  r := bot_overview(ws, ws + 6);
  PERFORM test.eq((r ->> 'total_units')::numeric, 58::numeric, 'overview units');
  PERFORM test.eq((r ->> 'customers_ordering')::int, 2, 'overview customers');
  PERFORM test.eq(r -> 'stopped_ordering' -> 0 ->> 'customer', 'מאפה ישן', 'stopped ordering');

  -- Audit log: the 0-quantity insert above is a change made today.
  PERFORM test.eq(jsonb_array_length(bot_customer_changes(c, current_date, current_date)) >= 1, true, 'changes today');
  PERFORM test.eq(jsonb_array_length(bot_customer_changes(c, ws + 3, ws + 3, 'delivery')), 2, 'changes by delivery day');

  BEGIN
    PERFORM bot_customer_report(c, ws + 6, ws);
    RAISE EXCEPTION 'backwards range accepted';
  EXCEPTION WHEN raise_exception THEN
    PERFORM test.eq(SQLERRM LIKE 'invalid date range%', true, 'backwards range rejected');
  END;
END $$;

DO $$
DECLARE
  b jsonb;
BEGIN
  INSERT INTO telegram_bot_users (user_id, name) VALUES (42, 'דור');
  b := telegram_bot_begin(1001, 42, 42);
  PERFORM test.eq((b ->> 'new')::boolean, true, 'first delivery is new');
  PERFORM test.eq((b ->> 'allowed')::boolean, true, 'listed user allowed');
  PERFORM test.eq(b ->> 'user_name', 'דור', 'user name');
  PERFORM test.eq((telegram_bot_begin(1001, 42, 42) ->> 'new')::boolean, false, 'retry is not new');
  PERFORM test.eq((telegram_bot_begin(1002, 7, 7) ->> 'allowed')::boolean, false, 'unknown user refused');

  PERFORM telegram_bot_remember(42, 'כמה הזמין?', '46 יחידות');
  b := telegram_bot_begin(1003, 42, 42);
  PERFORM test.eq(jsonb_array_length(b -> 'history'), 2, 'history kept');
  PERFORM test.eq(b -> 'history' -> 0 ->> 'role', 'user', 'oldest first');
  PERFORM test.eq(jsonb_array_length(telegram_bot_begin(1004, 42, 99) -> 'history'), 0, 'history per chat');

  PERFORM test.eq(telegram_bot_config(), '{}'::jsonb, 'no Vault in CI');
  PERFORM test.eq(telegram_bot_set_webhook() LIKE 'not configured%', true, 'webhook needs config');
END $$;
