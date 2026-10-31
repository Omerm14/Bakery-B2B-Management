-- Ask the Telegram bot about the orders ("how much did X order last week?",
-- "summary for X this month").
--
-- Telegram posts each message to the telegram-bot Edge Function (webhook).
-- The function lets Claude read the question and pick from the read-only
-- report functions below, then answers in the chat — as formatted text, or
-- as a designed summary image when a summary is asked for.
--
-- Nothing here changes an order. The report functions only read, and only
-- the service role (the Edge Function) and the SQL editor can call them.
-- Only Telegram users listed in telegram_bot_users get answers.
--
-- One-time setup (after deploying the function):
--   supabase secrets set ANTHROPIC_API_KEY=<key>
--   supabase functions deploy telegram-bot --no-verify-jwt
--   select telegram_bot_set_webhook();
--   -- Dor sends the bot any message in private; the bot answers with his
--   -- Telegram user id. Then:
--   insert into telegram_bot_users (user_id, name) values (<id>, 'דור');

-- ─── Who may ask ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_bot_users (
  user_id    bigint primary key,
  name       text not null,
  created_at timestamptz not null default now()
);

-- Telegram re-sends an update when the webhook is slow to answer; each
-- update_id is answered once.
CREATE TABLE IF NOT EXISTS telegram_bot_updates (
  update_id  bigint primary key,
  created_at timestamptz not null default now()
);

-- Recent questions and answers per chat, so a follow-up ("and last week?")
-- keeps its context. Kept for a week.
CREATE TABLE IF NOT EXISTS telegram_bot_history (
  id         bigserial primary key,
  chat_id    bigint not null,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS telegram_bot_history_chat_idx ON telegram_bot_history (chat_id, created_at desc);

ALTER TABLE telegram_bot_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_bot_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_bot_history ENABLE ROW LEVEL SECURITY;

-- ─── Matching helpers ───────────────────────────────────────────────────
-- Lower-case, no quotes / geresh / dashes / spaces, so "קפה ביאליק",
-- "קפה-ביאליק" and "קפה ביאליק בע״מ" all match.
CREATE OR REPLACE FUNCTION bot_norm(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(lower(COALESCE(p, '')), '[\s"''״׳`\-–—_.,()]+', '', 'g')
$$;

-- Customers whose name contains the query (Hebrew or English name), or all
-- active customers when the query is empty. Active first, exact first.
CREATE OR REPLACE FUNCTION bot_find_customers(p_query text DEFAULT NULL)
RETURNS jsonb
SECURITY DEFINER SET search_path = public AS $$
  WITH q AS (SELECT bot_norm(p_query) AS q),
  m AS (
    SELECT c.id, c.name, c.name_en, c.active,
      (SELECT max(ol.delivery_date) FROM order_lines ol WHERE ol.customer_id = c.id AND ol.quantity > 0) AS last_order_date,
      CASE WHEN bot_norm(c.name) = q.q OR bot_norm(c.name_en) = q.q THEN 0 ELSE 1 END AS rank
    FROM customers c, q
    WHERE (q.q = '' AND c.active)
       OR (q.q <> '' AND (bot_norm(c.name) LIKE '%' || q.q || '%' OR bot_norm(c.name_en) LIKE '%' || q.q || '%'))
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'name_en', name_en, 'active', active, 'last_order_date', last_order_date)
    ORDER BY rank, NOT active, name), '[]'::jsonb)
  FROM (SELECT * FROM m ORDER BY rank, NOT active, name LIMIT 200) x
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION bot_find_items(p_query text DEFAULT NULL)
RETURNS jsonb
SECURITY DEFINER SET search_path = public AS $$
  WITH q AS (SELECT bot_norm(p_query) AS q),
  m AS (
    SELECT mi.id, mi.name_he, mi.name_en, mi.category, mi.unit, mi.active,
      CASE WHEN bot_norm(mi.name_he) = q.q OR bot_norm(mi.name_en) = q.q THEN 0 ELSE 1 END AS rank
    FROM menu_items mi, q
    WHERE q.q = '' AND mi.active
       OR q.q <> '' AND (bot_norm(mi.name_he) LIKE '%' || q.q || '%'
                      OR bot_norm(mi.name_en) LIKE '%' || q.q || '%'
                      OR bot_norm(mi.category) = q.q)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'name', name_he, 'name_en', name_en, 'category', category, 'unit', unit, 'active', active)
    ORDER BY rank, NOT active, name_he), '[]'::jsonb)
  FROM (SELECT * FROM m ORDER BY rank, NOT active, name_he LIMIT 200) x
$$ LANGUAGE sql;

-- Rejects ranges the reports aren't meant for (backwards, or over a year).
CREATE OR REPLACE FUNCTION bot_check_range(p_from date, p_to date) RETURNS void
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'invalid date range: % – %', p_from, p_to;
  END IF;
  IF p_to - p_from > 370 THEN
    RAISE EXCEPTION 'date range too long (max ~1 year): % – %', p_from, p_to;
  END IF;
END;
$$;

-- ─── Reports ────────────────────────────────────────────────────────────
-- Everything one customer ordered between two dates (inclusive), with the
-- same-length period just before for comparison. Lines with quantity 0 are
-- "not ordered" and left out.
CREATE OR REPLACE FUNCTION bot_customer_report(p_customer_id uuid, p_from date, p_to date)
RETURNS jsonb
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_len int := p_to - p_from + 1;
  v_pfrom date := p_from - (p_to - p_from + 1);
  v_pto date := p_from - 1;
  v_result jsonb;
BEGIN
  PERFORM bot_check_range(p_from, p_to);
  IF NOT EXISTS (SELECT 1 FROM customers WHERE id = p_customer_id) THEN
    RAISE EXCEPTION 'customer not found: %', p_customer_id;
  END IF;

  WITH lines AS (
    SELECT ol.delivery_date, ol.quantity, mi.id AS item_id, mi.name_he, mi.category, mi.unit, mi.price,
      ol.delivery_date >= p_from AS cur
    FROM order_lines ol JOIN menu_items mi ON mi.id = ol.menu_item_id
    WHERE ol.customer_id = p_customer_id AND ol.quantity > 0
      AND ol.delivery_date BETWEEN v_pfrom AND p_to
  ),
  items AS (
    SELECT item_id, name_he, category, unit, price,
      COALESCE(sum(quantity) FILTER (WHERE cur), 0) AS qty,
      COALESCE(sum(quantity) FILTER (WHERE NOT cur), 0) AS prev_qty,
      count(DISTINCT delivery_date) FILTER (WHERE cur) AS days_ordered
    FROM lines GROUP BY item_id, name_he, category, unit, price
  ),
  days AS (
    SELECT delivery_date, sum(quantity) AS units,
      jsonb_agg(jsonb_build_object('item', name_he, 'qty', quantity) ORDER BY name_he) AS items
    FROM lines WHERE cur GROUP BY delivery_date
  ),
  cats AS (
    SELECT COALESCE(category, 'ללא קטגוריה') AS category, sum(qty) AS qty
    FROM items WHERE qty > 0 GROUP BY 1
  )
  SELECT jsonb_build_object(
    'customer', (SELECT jsonb_build_object('id', id, 'name', name, 'name_en', name_en, 'active', active,
                   'contact_person', contact_person) FROM customers WHERE id = p_customer_id),
    'business_name', (SELECT value ->> 'business_name' FROM app_config WHERE key = 'branding'),
    'from', p_from, 'to', p_to, 'days_in_range', v_len,
    'total_units', (SELECT COALESCE(sum(qty), 0) FROM items),
    'order_days', (SELECT count(*) FROM days),
    'distinct_items', (SELECT count(*) FROM items WHERE qty > 0),
    -- Only items that have a price set count toward the value.
    'total_value', (SELECT sum(qty * price) FROM items WHERE price IS NOT NULL AND qty > 0),
    'items_without_price', (SELECT count(*) FROM items WHERE price IS NULL AND qty > 0),
    'prev', jsonb_build_object('from', v_pfrom, 'to', v_pto,
      'total_units', (SELECT COALESCE(sum(prev_qty), 0) FROM items),
      'order_days', (SELECT count(DISTINCT delivery_date) FROM lines WHERE NOT cur),
      'total_value', (SELECT sum(prev_qty * price) FROM items WHERE price IS NOT NULL AND prev_qty > 0)),
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'name', name_he, 'category', category, 'unit', unit, 'qty', qty, 'prev_qty', prev_qty,
        'days_ordered', days_ordered, 'value', qty * price)
      ORDER BY qty DESC, name_he) FROM items), '[]'::jsonb),
    'categories', COALESCE((SELECT jsonb_agg(jsonb_build_object('category', category, 'qty', qty)
      ORDER BY qty DESC) FROM cats), '[]'::jsonb),
    -- Per-day detail only for short ranges; longer ones get units per day.
    'days', COALESCE((SELECT jsonb_agg(
        CASE WHEN v_len <= 31
          THEN jsonb_build_object('date', delivery_date, 'units', units, 'items', items)
          ELSE jsonb_build_object('date', delivery_date, 'units', units) END
      ORDER BY delivery_date) FROM days), '[]'::jsonb),
    'last_order_date', (SELECT max(delivery_date) FROM order_lines
                        WHERE customer_id = p_customer_id AND quantity > 0 AND delivery_date <= p_to)
  ) INTO v_result;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- One product between two dates: who ordered it and on which days.
CREATE OR REPLACE FUNCTION bot_item_report(p_item_id uuid, p_from date, p_to date)
RETURNS jsonb
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pfrom date := p_from - (p_to - p_from + 1);
  v_result jsonb;
BEGIN
  PERFORM bot_check_range(p_from, p_to);
  IF NOT EXISTS (SELECT 1 FROM menu_items WHERE id = p_item_id) THEN
    RAISE EXCEPTION 'item not found: %', p_item_id;
  END IF;

  WITH lines AS (
    SELECT ol.delivery_date, ol.quantity, c.name AS customer, ol.delivery_date >= p_from AS cur
    FROM order_lines ol JOIN customers c ON c.id = ol.customer_id
    WHERE ol.menu_item_id = p_item_id AND ol.quantity > 0
      AND ol.delivery_date BETWEEN v_pfrom AND p_to
  ),
  custs AS (
    SELECT customer,
      COALESCE(sum(quantity) FILTER (WHERE cur), 0) AS qty,
      COALESCE(sum(quantity) FILTER (WHERE NOT cur), 0) AS prev_qty
    FROM lines GROUP BY customer
  )
  SELECT jsonb_build_object(
    'item', (SELECT jsonb_build_object('name', name_he, 'name_en', name_en, 'category', category,
               'unit', unit, 'price', price, 'active', active) FROM menu_items WHERE id = p_item_id),
    'from', p_from, 'to', p_to,
    'total_qty', (SELECT COALESCE(sum(qty), 0) FROM custs),
    'prev_total_qty', (SELECT COALESCE(sum(prev_qty), 0) FROM custs),
    'customers', COALESCE((SELECT jsonb_agg(jsonb_build_object('customer', customer, 'qty', qty, 'prev_qty', prev_qty)
      ORDER BY qty DESC, customer) FROM custs), '[]'::jsonb),
    'days', COALESCE((SELECT jsonb_agg(jsonb_build_object('date', delivery_date, 'qty', qty) ORDER BY delivery_date)
      FROM (SELECT delivery_date, sum(quantity) AS qty FROM lines WHERE cur GROUP BY delivery_date) d), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- All customers between two dates: totals per day, per customer, per
-- product and category, plus who ordered in the previous period but not now.
CREATE OR REPLACE FUNCTION bot_overview(p_from date, p_to date)
RETURNS jsonb
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pfrom date := p_from - (p_to - p_from + 1);
  v_result jsonb;
BEGIN
  PERFORM bot_check_range(p_from, p_to);

  WITH lines AS (
    SELECT ol.delivery_date, ol.quantity, ol.customer_id, c.name AS customer,
      mi.name_he AS item, mi.category, mi.price, ol.delivery_date >= p_from AS cur
    FROM order_lines ol
    JOIN customers c ON c.id = ol.customer_id
    JOIN menu_items mi ON mi.id = ol.menu_item_id
    WHERE ol.quantity > 0 AND ol.delivery_date BETWEEN v_pfrom AND p_to
  ),
  custs AS (
    SELECT customer,
      COALESCE(sum(quantity) FILTER (WHERE cur), 0) AS qty,
      COALESCE(sum(quantity) FILTER (WHERE NOT cur), 0) AS prev_qty
    FROM lines GROUP BY customer
  ),
  items AS (
    SELECT item,
      COALESCE(sum(quantity) FILTER (WHERE cur), 0) AS qty,
      COALESCE(sum(quantity) FILTER (WHERE NOT cur), 0) AS prev_qty
    FROM lines GROUP BY item
  )
  SELECT jsonb_build_object(
    'from', p_from, 'to', p_to,
    'total_units', (SELECT COALESCE(sum(quantity), 0) FROM lines WHERE cur),
    'prev_total_units', (SELECT COALESCE(sum(quantity), 0) FROM lines WHERE NOT cur),
    'total_value', (SELECT sum(quantity * price) FROM lines WHERE cur AND price IS NOT NULL),
    'customers_ordering', (SELECT count(DISTINCT customer_id) FROM lines WHERE cur),
    'prev_customers_ordering', (SELECT count(DISTINCT customer_id) FROM lines WHERE NOT cur),
    'days', COALESCE((SELECT jsonb_agg(jsonb_build_object('date', delivery_date, 'units', units) ORDER BY delivery_date)
      FROM (SELECT delivery_date, sum(quantity) AS units FROM lines WHERE cur GROUP BY delivery_date) d), '[]'::jsonb),
    'customers', COALESCE((SELECT jsonb_agg(jsonb_build_object('customer', customer, 'qty', qty, 'prev_qty', prev_qty)
      ORDER BY qty DESC, customer) FROM custs WHERE qty > 0), '[]'::jsonb),
    'stopped_ordering', COALESCE((SELECT jsonb_agg(jsonb_build_object('customer', customer, 'prev_qty', prev_qty)
      ORDER BY prev_qty DESC) FROM custs WHERE qty = 0), '[]'::jsonb),
    'top_items', COALESCE((SELECT jsonb_agg(jsonb_build_object('item', item, 'qty', qty, 'prev_qty', prev_qty)
      ORDER BY qty DESC) FROM (SELECT * FROM items WHERE qty > 0 ORDER BY qty DESC LIMIT 30) i), '[]'::jsonb),
    'categories', COALESCE((SELECT jsonb_agg(jsonb_build_object('category', category, 'qty', qty) ORDER BY qty DESC)
      FROM (SELECT COALESCE(category, 'ללא קטגוריה') AS category, sum(quantity) AS qty
            FROM lines WHERE cur GROUP BY 1) k), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- What changed in a customer's order (from the audit log): changes made
-- between two dates, or to deliveries between two dates.
CREATE OR REPLACE FUNCTION bot_customer_changes(p_customer_id uuid, p_from date, p_to date,
  p_by text DEFAULT 'changed')
RETURNS jsonb
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM bot_check_range(p_from, p_to);
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'changed_at', to_char(a.created_at AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD HH24:MI'),
        'delivery_date', a.delivery_date,
        'item', COALESCE(mi.name_he, a.item_name_he),
        'action', a.action, 'old_qty', a.old_quantity, 'new_qty', a.new_quantity,
        'changed_by', a.changed_by, 'changed_via', a.changed_via, 'reason', a.change_reason)
      ORDER BY a.created_at)
    FROM (
      SELECT * FROM order_line_audit a
      WHERE a.customer_id = p_customer_id
        AND COALESCE(a.change_reason, '') <> 'auto_copy'
        AND CASE WHEN p_by = 'delivery'
              THEN a.delivery_date BETWEEN p_from AND p_to
              ELSE (a.created_at AT TIME ZONE 'Asia/Jerusalem')::date BETWEEN p_from AND p_to END
      ORDER BY a.created_at DESC
      LIMIT 150
    ) a
    LEFT JOIN menu_items mi ON mi.id = a.menu_item_id
  ), '[]'::jsonb);
END;
$$ LANGUAGE plpgsql;

-- ─── Bot plumbing (Edge Function only) ──────────────────────────────────
-- Credentials and the webhook secret from Vault, so nothing is configured twice.
CREATE OR REPLACE FUNCTION telegram_bot_config() RETURNS jsonb
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v jsonb;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;
  EXECUTE $q$
    SELECT jsonb_object_agg(name, decrypted_secret) FROM vault.decrypted_secrets
    WHERE name IN ('telegram_bot_token', 'telegram_webhook_secret')
  $q$ INTO v;
  RETURN COALESCE(v, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql;

-- Called once per incoming message: is the sender allowed, is this update
-- new (false = a Telegram retry, already handled), and the chat's recent
-- history for follow-up questions.
CREATE OR REPLACE FUNCTION telegram_bot_begin(p_update_id bigint, p_user_id bigint, p_chat_id bigint)
RETURNS jsonb
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new boolean;
  v_name text;
BEGIN
  INSERT INTO telegram_bot_updates (update_id) VALUES (p_update_id) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_new = ROW_COUNT;
  DELETE FROM telegram_bot_updates WHERE created_at < now() - interval '2 days';
  SELECT name INTO v_name FROM telegram_bot_users WHERE user_id = p_user_id;
  RETURN jsonb_build_object(
    'new', v_new,
    'allowed', v_name IS NOT NULL,
    'user_name', v_name,
    -- Last 10 turns from the past 3 hours, oldest first.
    'history', COALESCE((SELECT jsonb_agg(jsonb_build_object('role', role, 'content', content) ORDER BY id)
      FROM (SELECT * FROM telegram_bot_history
            WHERE chat_id = p_chat_id AND created_at > now() - interval '3 hours'
            ORDER BY id DESC LIMIT 10) h), '[]'::jsonb));
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION telegram_bot_remember(p_chat_id bigint, p_question text, p_answer text)
RETURNS void
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO telegram_bot_history (chat_id, role, content) VALUES
    (p_chat_id, 'user', left(p_question, 4000)),
    (p_chat_id, 'assistant', left(p_answer, 4000));
  DELETE FROM telegram_bot_history WHERE created_at < now() - interval '7 days';
END;
$$ LANGUAGE plpgsql;

-- Points the bot's webhook at the Edge Function (run once after deploying,
-- and again if the function URL ever changes). The secret Telegram echoes
-- back on every call is created here the first time.
CREATE OR REPLACE FUNCTION telegram_bot_set_webhook() RETURNS text
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_token text;
  v_secret text;
  v_url text := COALESCE(
    (SELECT value ->> 'url' FROM app_config WHERE key = 'telegram_bot'),
    'https://yyemntahsroxctahaqtx.supabase.co/functions/v1/telegram-bot');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
     OR to_regclass('vault.decrypted_secrets') IS NULL THEN
    RETURN 'not configured — enable pg_net and Vault first';
  END IF;
  EXECUTE $q$SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'telegram_bot_token'$q$ INTO v_token;
  IF v_token IS NULL THEN
    RETURN 'not configured — add telegram_bot_token to Vault (see migration 064)';
  END IF;
  EXECUTE $q$SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'telegram_webhook_secret'$q$ INTO v_secret;
  IF v_secret IS NULL THEN
    v_secret := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    EXECUTE 'SELECT vault.create_secret($1, $2)' USING v_secret, 'telegram_webhook_secret';
  END IF;
  EXECUTE 'SELECT net.http_post(url := $1, body := $2, timeout_milliseconds := 30000)'
    USING 'https://api.telegram.org/bot' || v_token || '/setWebhook',
          jsonb_build_object('url', v_url, 'secret_token', v_secret,
                             'allowed_updates', jsonb_build_array('message'),
                             'drop_pending_updates', true);
  RETURN 'webhook set to ' || v_url || ' — send the bot a message to test';
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION
  bot_find_customers(text), bot_find_items(text),
  bot_customer_report(uuid, date, date), bot_item_report(uuid, date, date), bot_overview(date, date),
  bot_customer_changes(uuid, date, date, text),
  telegram_bot_config(), telegram_bot_begin(bigint, bigint, bigint),
  telegram_bot_remember(bigint, text, text), telegram_bot_set_webhook()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  bot_find_customers(text), bot_find_items(text),
  bot_customer_report(uuid, date, date), bot_item_report(uuid, date, date), bot_overview(date, date),
  bot_customer_changes(uuid, date, date, text),
  telegram_bot_config(), telegram_bot_begin(bigint, bigint, bigint),
  telegram_bot_remember(bigint, text, text)
  TO service_role;
