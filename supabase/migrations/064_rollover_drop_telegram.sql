-- Send rollover drop alerts (migration 063) to a Telegram group, so the
-- floor sees a short delivery on their phones without opening the app.
--
-- Postgres posts straight to the Telegram Bot API through pg_net (a Supabase
-- extension) — no Edge Function to deploy. The bot token and chat id live in
-- Supabase Vault, never in the repo. Until both are set (or where pg_net /
-- Vault don't exist, e.g. CI), sending is a silent no-op.
--
-- One-time setup (Supabase dashboard):
--   1. Database -> Extensions: enable pg_net.
--   2. SQL editor:
--        select vault.create_secret('<bot token from @BotFather>', 'telegram_bot_token');
--        select vault.create_secret('<group chat id, e.g. -1001234567890>', 'telegram_chat_id');
--   3. select send_telegram_test();   -- a test message should arrive

ALTER TABLE rollover_drop_alerts ADD COLUMN IF NOT EXISTS telegram_sent_at timestamptz;

-- One message per customer + week for alerts not yet sent; plain text (no
-- parse_mode, so product names never need escaping). Split out from the
-- sender so the wording is testable without Telegram.
CREATE OR REPLACE FUNCTION rollover_drop_telegram_messages()
RETURNS TABLE (customer_id uuid, week_id uuid, message text)
SECURITY DEFINER SET search_path = public AS $$
  WITH pending AS (
    SELECT a.customer_id, a.week_id, a.delivery_date, a.expected_quantity, mi.name_he
    FROM rollover_drop_alerts a
    JOIN menu_items mi ON mi.id = a.menu_item_id
    WHERE a.telegram_sent_at IS NULL
  ),
  days AS (
    SELECT p.customer_id, p.week_id, p.delivery_date,
      (ARRAY['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'])[extract(dow FROM p.delivery_date)::int + 1]
        || ' ' || to_char(p.delivery_date, 'DD/MM') || E'\n'
        || string_agg('• ' || p.name_he || ' — ' || trim_scale(p.expected_quantity)::text, E'\n' ORDER BY p.name_he)
        AS block,
      count(*) AS n
    FROM pending p
    GROUP BY p.customer_id, p.week_id, p.delivery_date
  )
  -- Week label from the delivery dates themselves: when the rollover never
  -- ran, the alert's week_id points at this week (migration 063).
  SELECT d.customer_id, d.week_id,
    '⚠️ מוצרים שחסרים בהזמנה לשבוע הבא' || E'\n'
    || c.name || ' — ' || CASE WHEN sum(d.n) = 1 THEN 'מוצר אחד' ELSE sum(d.n) || ' מוצרים' END
    || ' (שבוע ' || to_char(min(d.delivery_date) - extract(dow FROM min(d.delivery_date))::int, 'DD/MM/YYYY') || ')'
    || E'\n\n' || string_agg(d.block, E'\n\n' ORDER BY d.delivery_date)
    || E'\n\n' || 'ההעתקה האוטומטית של יום רביעי לא העבירה אותם. כדאי לבדוק את ההזמנה.'
  FROM days d
  JOIN customers c ON c.id = d.customer_id
  GROUP BY d.customer_id, d.week_id, c.name
$$ LANGUAGE sql;

-- Posts text to the configured chat. Returns false (without raising) when
-- Telegram isn't configured, so callers on a schedule never fail on it.
CREATE OR REPLACE FUNCTION telegram_send(p_text text) RETURNS boolean
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_token text;
  v_chat text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
     OR to_regclass('vault.decrypted_secrets') IS NULL THEN
    RETURN false;
  END IF;
  EXECUTE $q$SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'telegram_bot_token'$q$ INTO v_token;
  EXECUTE $q$SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'telegram_chat_id'$q$ INTO v_chat;
  IF v_token IS NULL OR v_chat IS NULL THEN
    RETURN false;
  END IF;
  -- pg_net queues the request and sends it after commit (async).
  EXECUTE 'SELECT net.http_post(url := $1, body := $2)'
    USING 'https://api.telegram.org/bot' || v_token || '/sendMessage',
          jsonb_build_object('chat_id', v_chat, 'text', p_text, 'disable_web_page_preview', true);
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Sends every unsent alert, one message per customer, and marks them sent.
-- When next week has no alerts at all it sends a one-line all-clear instead,
-- so a Wednesday with no message at all means the check itself didn't run.
CREATE OR REPLACE FUNCTION send_rollover_drop_telegram() RETURNS integer
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_sent integer := 0;
BEGIN
  FOR r IN SELECT * FROM rollover_drop_telegram_messages() LOOP
    IF NOT telegram_send(r.message) THEN
      RETURN v_sent;  -- not configured: leave alerts unsent for later
    END IF;
    UPDATE rollover_drop_alerts SET telegram_sent_at = now()
    WHERE customer_id = r.customer_id AND week_id = r.week_id AND telegram_sent_at IS NULL;
    v_sent := v_sent + 1;
  END LOOP;

  IF v_sent = 0 AND NOT EXISTS (
    SELECT 1 FROM rollover_drop_alerts
    WHERE delivery_date >= current_date - extract(dow FROM current_date)::int + 7
      AND delivery_date <  current_date - extract(dow FROM current_date)::int + 14) THEN
    PERFORM telegram_send('✅ ההעתקה השבועית הושלמה — אין מוצרים חסרים בהזמנות לשבוע הבא.');
  END IF;
  RETURN v_sent;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION send_telegram_test() RETURNS text
SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN telegram_send('🔔 בדיקה: התראות המאפייה מחוברות לקבוצה הזו.')
    THEN 'sent — check the Telegram group'
    ELSE 'not configured — enable pg_net and add telegram_bot_token / telegram_chat_id to Vault'
  END
$$ LANGUAGE sql;

-- Only the scheduled job (postgres) and the SQL editor call these.
REVOKE EXECUTE ON FUNCTION telegram_send(text), send_rollover_drop_telegram(),
  send_telegram_test(), rollover_drop_telegram_messages() FROM PUBLIC, anon, authenticated;

-- The 03:30 check now also sends what it found.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rollover-drop-check') THEN
      PERFORM cron.unschedule('rollover-drop-check');
    END IF;
    PERFORM cron.schedule('rollover-drop-check', '30 3 * * 3',
      'select check_rollover_drops(); select send_rollover_drop_telegram();');
  END IF;
END $$;
