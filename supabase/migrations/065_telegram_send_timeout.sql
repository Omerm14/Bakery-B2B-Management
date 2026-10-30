-- Give Telegram 30 seconds to answer instead of pg_net's 5-second default.
--
-- The first production test of migration 064 never arrived:
-- net._http_response showed "Timeout of 5000 ms reached" with DNS resolved
-- in a few ms, i.e. api.telegram.org was simply slower than 5 s to answer
-- from Supabase. The request runs in pg_net's background worker after
-- commit, so a longer timeout never holds up the caller (or the cron job).
--
-- Full redefinition carried over from 064; the only change is
-- timeout_milliseconds on net.http_post.
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
  EXECUTE 'SELECT net.http_post(url := $1, body := $2, timeout_milliseconds := $3)'
    USING 'https://api.telegram.org/bot' || v_token || '/sendMessage',
          jsonb_build_object('chat_id', v_chat, 'text', p_text, 'disable_web_page_preview', true),
          30000;
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- CREATE OR REPLACE keeps the existing grants, but restate 064's revoke so
-- this file is correct on its own.
REVOKE EXECUTE ON FUNCTION telegram_send(text) FROM PUBLIC, anon, authenticated;
