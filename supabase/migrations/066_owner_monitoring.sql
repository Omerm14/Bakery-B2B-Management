-- Owner monitoring: short Telegram alerts for anything that could reach a
-- customer as a wrong or missing delivery, plus the data for the weekly
-- summary image (sent by the owner-weekly-report Edge Function).
--
-- Everything goes to the Telegram group set up in migration 064 through
-- telegram_send(), and is a silent no-op until Telegram is configured.
-- Each check only reports — none of them changes an order.
--
--   run_owner_monitor()     every 15 min:
--     * lock check     — when a delivery day's orders lock (cutoff from
--                        app_config, migration 058): totals vs the same day
--                        last week, customers with no order, sharp drops,
--                        quantities far above a customer's usual
--     * mass changes   — many future lines deleted / zeroed at once, and
--                        item deactivations that cleared customers' orders
--     * cron failures  — any scheduled job (rollover, checks) that failed
--   send_late_changes_digest()  every evening: changes made after cutoff
--   owner_weekly_summary()      numbers for Sunday's summary image

-- ─── Bookkeeping ────────────────────────────────────────────────────────
-- One row per alert sent (dedupe key + what was said), and a cursor per
-- check so each run only looks at what is new.
CREATE TABLE IF NOT EXISTS owner_alerts (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,
  dedupe_key text not null,
  message    text not null,
  created_at timestamptz not null default now(),
  UNIQUE (kind, dedupe_key)
);
CREATE INDEX IF NOT EXISTS owner_alerts_created_idx ON owner_alerts (created_at desc);

CREATE TABLE IF NOT EXISTS owner_monitor_state (
  key   text primary key,
  value timestamptz not null
);

ALTER TABLE owner_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_monitor_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_read" ON owner_alerts;
CREATE POLICY "staff_read" ON owner_alerts FOR SELECT TO authenticated USING (is_staff());

-- Sends one alert unless the same (kind, key) was already sent. Recorded
-- only when Telegram accepted it, so an unconfigured bot loses nothing.
CREATE OR REPLACE FUNCTION owner_alert(p_kind text, p_key text, p_message text) RETURNS boolean
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM owner_alerts WHERE kind = p_kind AND dedupe_key = p_key) THEN
    RETURN false;
  END IF;
  IF NOT telegram_send(left(p_message, 4000)) THEN
    RETURN false;
  END IF;
  INSERT INTO owner_alerts (kind, dedupe_key, message) VALUES (p_kind, p_key, p_message)
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- "חמישי 05/11"
CREATE OR REPLACE FUNCTION he_day_label(p_date date) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT (ARRAY['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'])[extract(dow FROM p_date)::int + 1]
         || ' ' || to_char(p_date, 'DD/MM')
$$;

CREATE OR REPLACE FUNCTION fmt_int(p numeric) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT to_char(round(p), 'FM999,999,990') $$;

-- "+3%" / "−12%" (true minus sign reads better in Telegram's RTL layout)
CREATE OR REPLACE FUNCTION fmt_pct(p_new numeric, p_old numeric) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN COALESCE(p_old, 0) = 0 THEN 'חדש'
    WHEN p_new >= p_old THEN '+' || round((p_new - p_old) * 100 / p_old) || '%'
    ELSE '−' || round((p_old - p_new) * 100 / p_old) || '%' END
$$;

-- ─── 1. Lock check ──────────────────────────────────────────────────────
-- Message for one delivery date, comparing it with the same weekday a week
-- earlier. NULL when neither day has any order (not a delivery day).
CREATE OR REPLACE FUNCTION lock_check_message(p_date date) RETURNS text
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_units numeric; v_prev_units numeric; v_cust int; v_prev_cust int;
  v_missing text; v_missing_n int;
  v_drops text; v_drops_n int;
  v_outliers text; v_outliers_n int;
  v_msg text;
BEGIN
  SELECT COALESCE(sum(quantity), 0), count(DISTINCT customer_id) FILTER (WHERE quantity > 0)
    INTO v_units, v_cust FROM order_lines WHERE delivery_date = p_date;
  SELECT COALESCE(sum(quantity), 0), count(DISTINCT customer_id) FILTER (WHERE quantity > 0)
    INTO v_prev_units, v_prev_cust FROM order_lines WHERE delivery_date = p_date - 7;
  IF v_units = 0 AND v_prev_units = 0 THEN
    RETURN NULL;
  END IF;

  -- Per active customer: this day vs the same day last week.
  WITH per AS (
    SELECT c.id, c.name,
      COALESCE(sum(ol.quantity) FILTER (WHERE ol.delivery_date = p_date), 0) AS units,
      COALESCE(sum(ol.quantity) FILTER (WHERE ol.delivery_date = p_date - 7), 0) AS prev_units,
      count(*) FILTER (WHERE ol.delivery_date = p_date - 7 AND ol.quantity > 0) AS prev_items
    FROM customers c
    JOIN order_lines ol ON ol.customer_id = c.id AND ol.delivery_date IN (p_date, p_date - 7)
    WHERE c.active
    GROUP BY c.id, c.name
  )
  SELECT
    (SELECT string_agg('• ' || name || ' — בשבוע שעבר ' || CASE WHEN prev_items = 1 THEN 'מוצר אחד' ELSE prev_items || ' מוצרים' END || ', ' || fmt_int(prev_units) || ' יח׳', E'\n' ORDER BY prev_units DESC)
       FROM (SELECT * FROM per WHERE units = 0 AND prev_units > 0 ORDER BY prev_units DESC LIMIT 8) m),
    (SELECT count(*) FROM per WHERE units = 0 AND prev_units > 0),
    (SELECT string_agg('• ' || name || ' — ' || fmt_int(prev_units) || ' ← ' || fmt_int(units) || ' יח׳ (' || fmt_pct(units, prev_units) || ')', E'\n' ORDER BY units / prev_units)
       FROM (SELECT * FROM per WHERE units > 0 AND prev_units >= 10 AND units < prev_units * 0.7
             ORDER BY units / prev_units LIMIT 8) d),
    (SELECT count(*) FROM per WHERE units > 0 AND prev_units >= 10 AND units < prev_units * 0.7)
  INTO v_missing, v_missing_n, v_drops, v_drops_n;

  -- A line at least 3x (and 10 units above) the customer's average for that
  -- item on the same weekday over the previous 4 weeks (needs 2+ of them).
  WITH hist AS (
    SELECT customer_id, menu_item_id, avg(quantity) AS avg_qty, count(*) AS n
    FROM order_lines
    WHERE delivery_date IN (p_date - 7, p_date - 14, p_date - 21, p_date - 28) AND quantity > 0
    GROUP BY customer_id, menu_item_id
  ), odd AS (
    SELECT c.name, mi.name_he, ol.quantity, h.avg_qty
    FROM order_lines ol
    JOIN hist h ON h.customer_id = ol.customer_id AND h.menu_item_id = ol.menu_item_id AND h.n >= 2
    JOIN customers c ON c.id = ol.customer_id
    JOIN menu_items mi ON mi.id = ol.menu_item_id
    WHERE ol.delivery_date = p_date
      AND ol.quantity >= h.avg_qty * 3 AND ol.quantity - h.avg_qty >= 10
  )
  SELECT
    (SELECT string_agg('• ' || name || ' · ' || name_he || ' — ' || fmt_int(quantity) || ' (בדרך כלל ' || fmt_int(avg_qty) || ')', E'\n' ORDER BY quantity / avg_qty DESC)
       FROM (SELECT * FROM odd ORDER BY quantity / avg_qty DESC LIMIT 8) o),
    (SELECT count(*) FROM odd)
  INTO v_outliers, v_outliers_n;

  v_msg := CASE WHEN v_missing_n + v_drops_n + v_outliers_n > 0 THEN '⚠️' ELSE '✅' END
    || ' הזמנות ל' || he_day_label(p_date) || ' ננעלו' || E'\n'
    || CASE WHEN v_cust = 1 THEN 'לקוח אחד' ELSE v_cust || ' לקוחות' END || ' · ' || fmt_int(v_units) || ' יח׳ (' || fmt_pct(v_units, v_prev_units) || ' משבוע שעבר)';

  IF v_missing_n > 0 THEN
    v_msg := v_msg || E'\n\n' || 'בלי הזמנה (הזמינו בשבוע שעבר):' || E'\n' || v_missing
      || CASE WHEN v_missing_n > 8 THEN E'\n' || '+ עוד ' || (v_missing_n - 8) ELSE '' END;
  END IF;
  IF v_drops_n > 0 THEN
    v_msg := v_msg || E'\n\n' || 'ירידה חדה:' || E'\n' || v_drops
      || CASE WHEN v_drops_n > 8 THEN E'\n' || '+ עוד ' || (v_drops_n - 8) ELSE '' END;
  END IF;
  IF v_outliers_n > 0 THEN
    v_msg := v_msg || E'\n\n' || 'כמות חריגה:' || E'\n' || v_outliers
      || CASE WHEN v_outliers_n > 8 THEN E'\n' || '+ עוד ' || (v_outliers_n - 8) ELSE '' END;
  END IF;
  RETURN v_msg;
END;
$$ LANGUAGE plpgsql;

-- Delivery dates whose orders locked in the last 2 days and weren't reported
-- yet. Dates locking in the same run (Wednesday 10:30 locks Thu-Sun, per
-- migration 058) go out as one message.
CREATE OR REPLACE FUNCTION run_lock_checks(p_now timestamptz DEFAULT now()) RETURNS integer
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_parts text[] := '{}';
  v_dates date[] := '{}';
  v_msg text;
BEGIN
  FOR r IN
    SELECT d::date AS d
    FROM generate_series(current_date - 3, current_date + 7, interval '1 day') d
    WHERE order_edit_lock_at(d::date) <= p_now
      AND order_edit_lock_at(d::date) > p_now - interval '2 days'
      AND NOT EXISTS (SELECT 1 FROM owner_alerts WHERE kind = 'lock_check' AND dedupe_key = d::date::text)
    ORDER BY 1
  LOOP
    v_msg := lock_check_message(r.d);
    IF v_msg IS NOT NULL THEN
      v_parts := v_parts || v_msg;
    END IF;
    v_dates := v_dates || r.d;
  END LOOP;

  IF array_length(v_dates, 1) IS NULL THEN
    RETURN 0;
  END IF;
  IF array_length(v_parts, 1) IS NOT NULL
     AND NOT telegram_send(left(array_to_string(v_parts, E'\n\n━━━━━━━━\n\n'), 4000)) THEN
    RETURN 0;  -- not configured / failed to queue: try again next run
  END IF;
  INSERT INTO owner_alerts (kind, dedupe_key, message)
  SELECT 'lock_check', d::text, COALESCE(array_to_string(v_parts, E'\n\n'), '(no orders)')
  FROM unnest(v_dates) d
  ON CONFLICT DO NOTHING;
  RETURN COALESCE(array_length(v_parts, 1), 0);
END;
$$ LANGUAGE plpgsql;

-- ─── 2. Mass changes ────────────────────────────────────────────────────
-- Future lines deleted or zeroed between p_since and p_until. Reported per
-- person when 20+ lines or 5+ customers; item deactivations (migration 061)
-- always, per item, when they cleared anyone's order.
CREATE OR REPLACE FUNCTION mass_change_messages(p_since timestamptz, p_until timestamptz)
RETURNS TABLE (dedupe_key text, message text)
SECURITY DEFINER SET search_path = public AS $$
  WITH cleared AS (
    SELECT a.*, COALESCE(a.changed_by, 'לא ידוע') AS who
    FROM order_line_audit a
    WHERE a.created_at > p_since AND a.created_at <= p_until
      AND a.delivery_date >= current_date
      AND COALESCE(a.old_quantity, 0) > 0
      AND (a.action = 'delete' OR (a.action = 'update' AND a.new_quantity = 0))
  ),
  deactivated AS (
    SELECT 'deactivate:' || COALESCE(menu_item_id::text, item_name_he) || ':' || min(created_at)::text AS dedupe_key,
      '⚠️ מוצר הושבת: ' || COALESCE(max(item_name_he), '—') || E'\n'
      || 'אופסו ' || count(*) || ' שורות הזמנה אצל ' || count(DISTINCT customer_id) || ' לקוחות ('
      || to_char(min(delivery_date), 'DD/MM') || '–' || to_char(max(delivery_date), 'DD/MM') || ')' || E'\n'
      || 'לקוחות: ' || string_agg(DISTINCT customer_name, ', ') || E'\n'
      || 'ע"י ' || max(who) AS message
    FROM cleared
    WHERE changed_via = 'item_deactivated'
    GROUP BY COALESCE(menu_item_id::text, item_name_he)
  ),
  bulk AS (
    SELECT 'bulk:' || who || ':' || min(created_at)::text AS dedupe_key,
      '⚠️ מחיקה / איפוס המוני של הזמנות' || E'\n'
      || who || ' — ' || count(*) || ' שורות אצל ' || count(DISTINCT customer_id) || ' לקוחות ('
      || to_char(min(delivery_date), 'DD/MM') || '–' || to_char(max(delivery_date), 'DD/MM') || ')' || E'\n'
      || count(*) FILTER (WHERE action = 'delete') || ' נמחקו · '
      || count(*) FILTER (WHERE action = 'update') || ' אופסו' || E'\n'
      || 'אם זה לא היה מכוון — אפשר לשחזר מיומן השינויים.' AS message
    FROM cleared
    WHERE changed_via IS DISTINCT FROM 'item_deactivated'
    GROUP BY who
    HAVING count(*) >= 20 OR count(DISTINCT customer_id) >= 5
  )
  SELECT * FROM deactivated
  UNION ALL
  SELECT * FROM bulk
$$ LANGUAGE sql;

-- ─── 3. Failed scheduled jobs ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION cron_failure_messages(p_since timestamptz)
RETURNS TABLE (dedupe_key text, message text)
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF to_regclass('cron.job_run_details') IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY EXECUTE $q$
    SELECT 'cron:' || d.runid::text,
      '🚨 משימה אוטומטית נכשלה: ' || COALESCE(j.jobname, 'job ' || d.jobid) || E'\n'
      || to_char(d.start_time AT TIME ZONE 'Asia/Jerusalem', 'DD/MM HH24:MI') || E'\n'
      || left(COALESCE(d.return_message, ''), 300)
    FROM cron.job_run_details d
    LEFT JOIN cron.job j ON j.jobid = d.jobid
    WHERE d.status = 'failed' AND d.start_time > $1
    ORDER BY d.start_time
  $q$ USING p_since;
END;
$$ LANGUAGE plpgsql;

-- Runs checks 1-3. Each check's cursor moves only after its messages were
-- handed to Telegram, so nothing is skipped while the bot isn't configured.
CREATE OR REPLACE FUNCTION run_owner_monitor() RETURNS integer
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now timestamptz := now();
  v_since timestamptz;
  v_sent integer := 0;
  v_ok boolean := true;
  r record;
BEGIN
  v_sent := v_sent + run_lock_checks(v_now);

  SELECT value INTO v_since FROM owner_monitor_state WHERE key = 'mass_changes';
  v_since := COALESCE(v_since, v_now - interval '15 minutes');
  FOR r IN SELECT * FROM mass_change_messages(v_since, v_now) LOOP
    IF owner_alert('mass_change', r.dedupe_key, r.message) THEN
      v_sent := v_sent + 1;
    ELSIF NOT EXISTS (SELECT 1 FROM owner_alerts WHERE kind = 'mass_change' AND dedupe_key = r.dedupe_key) THEN
      v_ok := false;
    END IF;
  END LOOP;
  IF v_ok THEN
    INSERT INTO owner_monitor_state VALUES ('mass_changes', v_now)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  END IF;

  v_ok := true;
  SELECT value INTO v_since FROM owner_monitor_state WHERE key = 'cron_failures';
  v_since := COALESCE(v_since, v_now - interval '1 day');
  FOR r IN SELECT * FROM cron_failure_messages(v_since) LOOP
    IF owner_alert('cron_failure', r.dedupe_key, r.message) THEN
      v_sent := v_sent + 1;
    ELSIF NOT EXISTS (SELECT 1 FROM owner_alerts WHERE kind = 'cron_failure' AND dedupe_key = r.dedupe_key) THEN
      v_ok := false;
    END IF;
  END LOOP;
  IF v_ok THEN
    INSERT INTO owner_monitor_state VALUES ('cron_failures', v_now)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  END IF;

  RETURN v_sent;
END;
$$ LANGUAGE plpgsql;

-- ─── 4. Evening digest: changes after cutoff ────────────────────────────
-- Changes logged on p_day (Israel time) to lines whose order had already
-- locked: the floor needs to know about them before production.
CREATE OR REPLACE FUNCTION late_changes_message(p_day date DEFAULT (now() AT TIME ZONE 'Asia/Jerusalem')::date)
RETURNS text
SECURITY DEFINER SET search_path = public AS $$
  WITH late AS (
    SELECT a.delivery_date, COALESCE(a.customer_name, '—') AS customer,
      COALESCE(a.item_name_he, '—') AS item, a.old_quantity, a.new_quantity, a.changed_by
    FROM order_line_audit a
    WHERE (a.created_at AT TIME ZONE 'Asia/Jerusalem')::date = p_day
      AND a.delivery_date >= p_day
      AND a.created_at > order_edit_lock_at(a.delivery_date)
      AND a.action IN ('insert', 'update', 'delete', 'move')
      AND COALESCE(a.change_reason, '') <> 'auto_copy'
      AND a.new_quantity IS DISTINCT FROM a.old_quantity
  ),
  per_customer AS (
    SELECT delivery_date, customer,
      string_agg(item || ' ' || COALESCE(fmt_int(old_quantity), '0') || '→' || fmt_int(new_quantity), ', ' ORDER BY item) AS changes,
      string_agg(DISTINCT changed_by, ', ') AS who
    FROM late
    GROUP BY delivery_date, customer
  )
  SELECT CASE WHEN count(*) = 0 THEN NULL ELSE
    '📝 שינויים אחרי שעת הסגירה היום' || E'\n\n'
    || string_agg('• ' || he_day_label(delivery_date) || ' · ' || customer || ': ' || changes
                  || CASE WHEN who IS NOT NULL THEN ' (ע"י ' || who || ')' ELSE '' END,
                  E'\n' ORDER BY delivery_date, customer)
  END
  FROM per_customer
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION send_late_changes_digest() RETURNS boolean
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_day date := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
  v_msg text := late_changes_message(v_day);
BEGIN
  IF v_msg IS NULL THEN
    RETURN false;
  END IF;
  RETURN owner_alert('late_changes', v_day::text, v_msg);
END;
$$ LANGUAGE plpgsql;

-- ─── 5. Weekly summary data ─────────────────────────────────────────────
-- Everything Sunday's image shows, for the week starting p_week_start
-- (a Sunday) vs the week before. Default: the week that just ended.
CREATE OR REPLACE FUNCTION owner_weekly_summary(
  p_week_start date DEFAULT current_date - extract(dow FROM current_date)::int - 7)
RETURNS jsonb
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_end date := p_week_start + 7;
  v_prev date := p_week_start - 7;
  v_result jsonb;
  v_rollover_ok boolean;
  v_drop_ok boolean;
BEGIN
  IF to_regclass('cron.job_run_details') IS NOT NULL THEN
    EXECUTE $q$
      SELECT
        bool_or(j.jobname = 'weekly-auto-copy' AND d.status = 'succeeded'),
        bool_or(j.jobname = 'rollover-drop-check' AND d.status = 'succeeded')
      FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
      WHERE d.start_time >= $1 AND d.start_time < $2
    $q$ INTO v_rollover_ok, v_drop_ok
    USING p_week_start::timestamp AT TIME ZONE 'Asia/Jerusalem', v_end::timestamp AT TIME ZONE 'Asia/Jerusalem';
  END IF;

  WITH lines AS (
    SELECT ol.customer_id, ol.delivery_date, ol.quantity,
      CASE WHEN ol.delivery_date >= p_week_start THEN 'cur' ELSE 'prev' END AS wk
    FROM order_lines ol
    WHERE ol.delivery_date >= v_prev AND ol.delivery_date < v_end AND ol.quantity > 0
  ),
  days AS (
    SELECT g.dow,
      COALESCE(sum(l.quantity) FILTER (WHERE l.wk = 'cur'), 0) AS cur,
      COALESCE(sum(l.quantity) FILTER (WHERE l.wk = 'prev'), 0) AS prev
    FROM generate_series(0, 6) AS g(dow)
    LEFT JOIN lines l ON extract(dow FROM l.delivery_date)::int = g.dow
    GROUP BY g.dow
  ),
  movers AS (
    SELECT c.name,
      COALESCE(sum(l.quantity) FILTER (WHERE l.wk = 'cur'), 0) AS cur,
      COALESCE(sum(l.quantity) FILTER (WHERE l.wk = 'prev'), 0) AS prev
    FROM lines l JOIN customers c ON c.id = l.customer_id
    GROUP BY c.name
    HAVING COALESCE(sum(l.quantity) FILTER (WHERE l.wk = 'prev'), 0) >= 20
  ),
  changes AS (
    SELECT
      count(*) FILTER (WHERE a.created_at >= p_week_start::timestamp AT TIME ZONE 'Asia/Jerusalem') AS cur,
      count(*) FILTER (WHERE a.created_at < p_week_start::timestamp AT TIME ZONE 'Asia/Jerusalem') AS prev
    FROM order_line_audit a
    WHERE a.created_at >= v_prev::timestamp AT TIME ZONE 'Asia/Jerusalem'
      AND a.created_at < v_end::timestamp AT TIME ZONE 'Asia/Jerusalem'
      AND a.changed_via = 'customer_portal'
      AND COALESCE(a.change_reason, '') <> 'auto_copy'
  ),
  alerts AS (
    SELECT kind, count(*) AS n
    FROM owner_alerts
    WHERE created_at >= p_week_start::timestamp AT TIME ZONE 'Asia/Jerusalem'
      AND created_at < v_end::timestamp AT TIME ZONE 'Asia/Jerusalem'
      AND (kind <> 'lock_check' OR message LIKE '⚠️%')
    GROUP BY kind
  )
  SELECT jsonb_build_object(
    'business_name', (SELECT value ->> 'business_name' FROM app_config WHERE key = 'branding'),
    'week_start', p_week_start,
    'week_end', v_end - 1,
    'units', (SELECT COALESCE(sum(quantity), 0) FROM lines WHERE wk = 'cur'),
    'prev_units', (SELECT COALESCE(sum(quantity), 0) FROM lines WHERE wk = 'prev'),
    'customers', (SELECT count(DISTINCT customer_id) FROM lines WHERE wk = 'cur'),
    'prev_customers', (SELECT count(DISTINCT customer_id) FROM lines WHERE wk = 'prev'),
    'customer_changes', (SELECT cur FROM changes),
    'prev_customer_changes', (SELECT prev FROM changes),
    'days', (SELECT jsonb_agg(jsonb_build_object('dow', dow, 'cur', cur, 'prev', prev) ORDER BY dow) FROM days),
    'movers', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', name, 'cur', cur, 'prev', prev,
                         'pct', round((cur - prev) * 100.0 / prev)) ORDER BY abs(cur - prev) / prev DESC)
                       FROM (SELECT * FROM movers WHERE cur <> prev ORDER BY abs(cur - prev) / prev DESC LIMIT 4) m), '[]'::jsonb),
    'drop_alerts', (SELECT count(*) FROM rollover_drop_alerts
                    WHERE created_at >= p_week_start::timestamp AT TIME ZONE 'Asia/Jerusalem'
                      AND created_at < v_end::timestamp AT TIME ZONE 'Asia/Jerusalem'),
    'alerts', COALESCE((SELECT jsonb_object_agg(kind, n) FROM alerts), '{}'::jsonb),
    'rollover_ok', v_rollover_ok,
    'drop_check_ok', v_drop_ok
  ) INTO v_result;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- For the owner-weekly-report Edge Function (service role only): Telegram
-- credentials from Vault and the shared secret the cron call must present,
-- so nothing is configured twice.
CREATE OR REPLACE FUNCTION owner_report_config() RETURNS jsonb
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v jsonb;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;
  EXECUTE $q$
    SELECT jsonb_object_agg(name, decrypted_secret) FROM vault.decrypted_secrets
    WHERE name IN ('telegram_bot_token', 'telegram_chat_id', 'owner_report_secret')
  $q$ INTO v;
  RETURN COALESCE(v, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql;

-- Calls the Edge Function (Sunday morning). The secret is created here the
-- first time, so the only setup is deploying the function.
CREATE OR REPLACE FUNCTION trigger_owner_weekly_report() RETURNS boolean
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_secret text;
  v_url text := COALESCE(
    (SELECT value ->> 'url' FROM app_config WHERE key = 'owner_weekly_report'),
    'https://yyemntahsroxctahaqtx.supabase.co/functions/v1/owner-weekly-report');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
     OR to_regclass('vault.decrypted_secrets') IS NULL THEN
    RETURN false;
  END IF;
  EXECUTE $q$SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'owner_report_secret'$q$ INTO v_secret;
  IF v_secret IS NULL THEN
    RETURN false;
  END IF;
  EXECUTE 'SELECT net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 60000)'
    USING v_url, '{}'::jsonb,
          jsonb_build_object('Content-Type', 'application/json', 'x-report-secret', v_secret);
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Dynamic SQL so the block also compiles where Vault doesn't exist (CI).
DO $$
DECLARE
  v_exists boolean;
BEGIN
  IF to_regclass('vault.secrets') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE $q$SELECT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'owner_report_secret')$q$ INTO v_exists;
  IF NOT v_exists THEN
    EXECUTE $q$SELECT vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'owner_report_secret')$q$;
  END IF;
END $$;

-- Internal only: the scheduled jobs (postgres), the SQL editor, and the Edge
-- Function through the service role.
REVOKE EXECUTE ON FUNCTION owner_alert(text, text, text), lock_check_message(date), run_lock_checks(timestamptz),
  mass_change_messages(timestamptz, timestamptz), cron_failure_messages(timestamptz), run_owner_monitor(),
  late_changes_message(date), send_late_changes_digest(), owner_weekly_summary(date),
  owner_report_config(), trigger_owner_weekly_report()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION owner_weekly_summary(date), owner_report_config() TO service_role;

-- Schedules (UTC). Evening digest 16:30 UTC = 18:30/19:30 Israel; weekly
-- report Sunday 05:00 UTC = 07:00/08:00 Israel.
DO $$
DECLARE
  j record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;
  FOR j IN SELECT * FROM (VALUES
      ('owner-monitor', '*/15 * * * *', 'select run_owner_monitor()'),
      ('owner-late-changes', '30 16 * * *', 'select send_late_changes_digest()'),
      ('owner-weekly-report', '0 5 * * 0', 'select trigger_owner_weekly_report()')
    ) AS t(name, schedule, command)
  LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j.name) THEN
      PERFORM cron.unschedule(j.name);
    END IF;
    PERFORM cron.schedule(j.name, j.schedule, j.command);
  END LOOP;
END $$;
