-- Telegram wording for drop alerts (migration 064), and that sending is a
-- safe no-op where Telegram isn't configured (no pg_net / Vault here).
DO $$
DECLARE
  c uuid := test.customer('שאנטל');
  bagel uuid := test.item('בגט'); croissant uuid := test.item('קרואסון חמאה');
  msg text;
BEGIN
  PERFORM test.line(c, bagel, 15, 3);
  PERFORM test.line(c, croissant, 7, 3);
  PERFORM test.eq(check_rollover_drops(), 2, 'no rollover: both products missing');

  SELECT message INTO msg FROM rollover_drop_telegram_messages() WHERE customer_id = c;
  PERFORM test.eq(msg LIKE '%שאנטל — 2 מוצרים (שבוע ' || to_char(test.this_week() + 7, 'DD/MM/YYYY') || ')%', true,
                  'names the customer, count and next week: ' || msg);
  PERFORM test.eq(msg LIKE '%חמישי ' || to_char(test.this_week() + 11, 'DD/MM') || '%', true, 'names the weekday and date');
  PERFORM test.eq(msg LIKE '%• בגט — 15%' AND msg LIKE '%• קרואסון חמאה — 7%', true, 'lists products with expected qty');
  PERFORM test.eq((SELECT count(*) FROM rollover_drop_telegram_messages())::int, 1, 'one message per customer');

  PERFORM test.eq(telegram_send('x'), false, 'unconfigured send is a no-op');
  PERFORM test.eq(send_rollover_drop_telegram(), 0, 'nothing sent when unconfigured');
  PERFORM test.eq((SELECT count(*) FROM rollover_drop_alerts WHERE telegram_sent_at IS NULL)::int, 2,
                  'alerts stay unsent for a later run');
  PERFORM test.eq(send_telegram_test() LIKE 'not configured%', true, 'test helper explains what is missing');
END $$;

DO $$
BEGIN
  PERFORM test.eq((SELECT command FROM cron.job WHERE jobname = 'rollover-drop-check'),
    'select check_rollover_drops(); select send_rollover_drop_telegram();', 'check job also sends to Telegram');
END $$;
