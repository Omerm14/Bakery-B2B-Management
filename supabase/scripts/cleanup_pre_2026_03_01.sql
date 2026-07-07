-- Manual data cleanup: delete stale data from before 2026-03-01.
-- NOT a migration -- run this by hand in the Supabase SQL editor when
-- ready, not via the migration pipeline.
--
-- FK behavior (confirmed against migrations 001, 003, 006):
--   order_lines.week_id -> weeks(id)         ON DELETE CASCADE
--   packing_checks.order_line_id -> order_lines(id) ON DELETE CASCADE
--   order_line_audit.week_id -> weeks(id)    ON DELETE SET NULL (survives, keeps history)
--   production_checks has no FK to weeks (keyed by menu_item_id, delivery_date) -- deleted separately
--
-- Backup tables are created first and are safe to drop manually once
-- you've confirmed the results are as expected.

CREATE TABLE weeks_backup_pre_20260301_cleanup AS
  SELECT * FROM weeks WHERE start_date < '2026-03-01';

CREATE TABLE order_lines_backup_pre_20260301_cleanup AS
  SELECT ol.* FROM order_lines ol
  JOIN weeks w ON w.id = ol.week_id
  WHERE w.start_date < '2026-03-01';

CREATE TABLE packing_checks_backup_pre_20260301_cleanup AS
  SELECT pc.* FROM packing_checks pc
  JOIN order_lines ol ON ol.id = pc.order_line_id
  JOIN weeks w ON w.id = ol.week_id
  WHERE w.start_date < '2026-03-01';

CREATE TABLE production_checks_backup_pre_20260301_cleanup AS
  SELECT * FROM production_checks WHERE delivery_date < '2026-03-01';

-- Run the deletes:
DELETE FROM production_checks WHERE delivery_date < '2026-03-01';
DELETE FROM weeks WHERE start_date < '2026-03-01';  -- cascades order_lines -> packing_checks

-- Verify:
SELECT count(*) FROM weeks WHERE start_date < '2026-03-01';            -- expect 0
SELECT count(*) FROM order_line_audit WHERE created_at < '2026-03-01'; -- expect > 0 (untouched, kept as history)

-- Once you're satisfied with the result, drop the backup tables:
-- DROP TABLE weeks_backup_pre_20260301_cleanup;
-- DROP TABLE order_lines_backup_pre_20260301_cleanup;
-- DROP TABLE packing_checks_backup_pre_20260301_cleanup;
-- DROP TABLE production_checks_backup_pre_20260301_cleanup;
