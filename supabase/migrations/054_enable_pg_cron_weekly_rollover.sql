-- Migrations 027 and 032 only SCHEDULED the Wednesday auto-copy job when
-- pg_cron was already enabled -- neither one ever enabled the extension
-- itself, since 027's original comment expected that to happen once, by
-- hand, via Database -> Extensions in the Supabase dashboard. That manual
-- step was apparently never done: `run_weekly_rollover()` works correctly
-- when called directly, but with no cron.job row scheduling it, it has
-- never once fired on its own, which is why next week's orders show up
-- completely empty instead of pre-filled from this week.
--
-- Supabase's hosted Postgres ships pg_cron pre-loaded for every project, so
-- enabling it via SQL (as opposed to the dashboard toggle, which just runs
-- this same statement) works without a cluster restart.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-auto-copy') THEN
    PERFORM cron.unschedule('weekly-auto-copy');
  END IF;
  PERFORM cron.schedule('weekly-auto-copy', '0 3 * * 3', 'select run_weekly_rollover()');
END $$;
