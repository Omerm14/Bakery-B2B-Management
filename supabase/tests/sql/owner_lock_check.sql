-- Lock check (migration 066): when a delivery day's orders lock, compare it
-- with the same weekday last week and flag what could reach a customer wrong.
DO $$
DECLARE
  d date := current_date + 2;                       -- a day whose lock is in the future
  regular uuid := test.customer('קבוע');
  silent uuid := test.customer('קיוסקו');
  dropped uuid := test.customer('שאנטל');
  gone uuid := test.customer('לא פעיל', false);
  bagel uuid := test.item('בגט'); rolls uuid := test.item('לחמניה');
  msg text;
  wk int;
BEGIN
  -- Four weeks of history on the same weekday, then this week.
  FOR wk IN 1..4 LOOP
    INSERT INTO order_lines (week_id, customer_id, menu_item_id, delivery_date, quantity, source, status) VALUES
      (test.week(d - 7 * wk - extract(dow FROM d - 7 * wk)::int), regular, bagel, d - 7 * wk, 15, 'manual', 'ok'),
      (test.week(d - 7 * wk - extract(dow FROM d - 7 * wk)::int), silent,  bagel, d - 7 * wk, 12, 'manual', 'ok'),
      (test.week(d - 7 * wk - extract(dow FROM d - 7 * wk)::int), dropped, rolls, d - 7 * wk, 60, 'manual', 'ok'),
      (test.week(d - 7 * wk - extract(dow FROM d - 7 * wk)::int), gone,    rolls, d - 7 * wk, 30, 'manual', 'ok');
  END LOOP;
  INSERT INTO order_lines (week_id, customer_id, menu_item_id, delivery_date, quantity, source, status) VALUES
    (test.week(d - extract(dow FROM d)::int), regular, bagel, d, 150, 'manual', 'ok'),   -- typo: usually 15
    (test.week(d - extract(dow FROM d)::int), dropped, rolls, d, 35, 'manual', 'ok');    -- 60 -> 35

  msg := lock_check_message(d);
  PERFORM test.eq(msg LIKE '⚠️ הזמנות ל' || he_day_label(d) || ' ננעלו%', true, 'header names the day: ' || msg);
  PERFORM test.eq(msg LIKE '%2 לקוחות · 185 יח׳ (+58% משבוע שעבר)%', true, 'totals vs last week (active + inactive last week): ' || msg);
  PERFORM test.eq(msg LIKE '%בלי הזמנה%• קיוסקו — בשבוע שעבר מוצר אחד, 12 יח׳%', true, 'customer with no order');
  PERFORM test.eq(msg NOT LIKE '%לא פעיל%', true, 'inactive customers are not flagged');
  PERFORM test.eq(msg LIKE '%ירידה חדה:%• שאנטל — 60 ← 35 יח׳ (−42%)%', true, 'sharp drop');
  PERFORM test.eq(msg LIKE '%כמות חריגה:%• קבוע · בגט — 150 (בדרך כלל 15)%', true, 'quantity far above usual');

  -- A normal day: green, one line.
  UPDATE order_lines SET quantity = 15 WHERE customer_id = regular AND delivery_date = d;
  UPDATE order_lines SET quantity = 58 WHERE customer_id = dropped AND delivery_date = d;
  INSERT INTO order_lines (week_id, customer_id, menu_item_id, delivery_date, quantity, source, status)
  VALUES (test.week(d - extract(dow FROM d)::int), silent, bagel, d, 12, 'manual', 'ok');
  msg := lock_check_message(d);
  PERFORM test.eq(msg, '✅ הזמנות ל' || he_day_label(d) || ' ננעלו' || E'\n' || '3 לקוחות · 85 יח׳ (−27% משבוע שעבר)', 'normal day is one green line');

  PERFORM test.eq(lock_check_message(d + 1), NULL::text, 'no orders either week: nothing to say');

  -- Only dates whose lock has passed are picked up; unconfigured Telegram
  -- records nothing, so the check runs again once the bot is set up.
  PERFORM test.eq(run_lock_checks(order_edit_lock_at(d) - interval '1 minute'), 0, 'before the lock: nothing');
  PERFORM test.eq(run_lock_checks(order_edit_lock_at(d) + interval '5 minutes'), 0, 'unconfigured Telegram sends nothing');
  PERFORM test.eq((SELECT count(*) FROM owner_alerts WHERE kind = 'lock_check' AND dedupe_key = d::text)::int, 0, 'and does not mark the day as reported');
END $$;
