-- Evening digest of changes after cutoff, and the weekly summary numbers (migration 066).
DO $$
DECLARE
  c uuid := test.customer('קיוסקו');
  bagel uuid := test.item('בגט');
  l uuid;
  msg text;
BEGIN
  -- Today's delivery locked yesterday (or earlier), so any change today is late.
  INSERT INTO order_lines (week_id, customer_id, menu_item_id, delivery_date, quantity, source, status, changed_by)
  VALUES (test.week(current_date - extract(dow FROM current_date)::int), c, bagel, current_date, 15, 'manual', 'ok', 'staff@bakery.test')
  RETURNING id INTO l;
  UPDATE order_lines SET quantity = 20 WHERE id = l;

  msg := late_changes_message();
  PERFORM test.eq(msg LIKE '📝 שינויים אחרי שעת הסגירה היום%• ' || he_day_label(current_date) || ' · קיוסקו: בגט 0→15, בגט 15→20 (ע"י staff@bakery.test)', true,
                  'late change listed: ' || COALESCE(msg, '<none>'));

  -- Lines still open for editing are not late.
  PERFORM test.line(c, bagel, 5, 8);
  PERFORM test.eq(late_changes_message() NOT LIKE '%' || he_day_label(test.this_week() + 9) || '%', true, 'open days are not late');
  PERFORM test.eq(send_late_changes_digest(), false, 'unconfigured Telegram sends nothing');
END $$;

DO $$
DECLARE
  a uuid := test.customer('א'); b uuid := test.customer('ב');
  bagel uuid := test.item('לחם');
  ws date := test.this_week() - 7;   -- last week
  s jsonb;
BEGIN
  INSERT INTO order_lines (week_id, customer_id, menu_item_id, delivery_date, quantity, source, status) VALUES
    (test.week(ws - 7), a, bagel, ws - 7 + 1, 100, 'manual', 'ok'),
    (test.week(ws - 7), b, bagel, ws - 7 + 4, 40, 'manual', 'ok'),
    (test.week(ws), a, bagel, ws + 1, 110, 'manual', 'ok'),
    (test.week(ws), b, bagel, ws + 4, 20, 'manual', 'ok');
  s := owner_weekly_summary();
  PERFORM test.eq((s ->> 'week_start')::date, ws, 'defaults to the week that just ended');
  PERFORM test.eq((s ->> 'units')::numeric, 130::numeric, 'units this week');
  PERFORM test.eq((s ->> 'prev_units')::numeric, 140::numeric, 'units last week');
  PERFORM test.eq((s ->> 'customers')::int, 2, 'active customers');
  PERFORM test.eq((s -> 'days' -> 1 ->> 'cur')::numeric, 110::numeric, 'Monday this week');
  PERFORM test.eq((s -> 'days' -> 4 ->> 'prev')::numeric, 40::numeric, 'Thursday last week');
  PERFORM test.eq(s -> 'movers' -> 0 ->> 'name', 'ב', 'biggest mover first');
  PERFORM test.eq((s -> 'movers' -> 0 ->> 'pct')::int, -50, 'mover change in %');
END $$;
