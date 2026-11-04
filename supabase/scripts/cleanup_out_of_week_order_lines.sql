-- Remove order lines whose delivery_date is outside the week they belong to.
--
-- Background: migration 070. One portal send on 2026-08-21 stored 5 of
-- Gazeti's lines under the following week; the Wednesday rollover then
-- re-created them one week later, every week (55 rows by 2026-11-04, all
-- Gazeti). Order screens never show these rows; Production adds them on top
-- of the real order. They are not orders anyone placed.
--
-- NOT a migration -- run by hand in the Supabase SQL editor, one section at
-- a time, in order. Section 1 only reads. Sections 2-3 write. Run section 3
-- BEFORE the next Wednesday 05:00 rollover if migration 070 is not deployed
-- yet (070 stops the copying on its own, but the rows stay in Production
-- until deleted).

-- ════════════════════════════════════════════════════════════════════════════
-- 1. OVERVIEW — every stray line, per customer
-- ════════════════════════════════════════════════════════════════════════════
SELECT c.name AS customer,
       count(*) AS stray_lines,
       count(*) FILTER (WHERE ol.delivery_date >= current_date) AS today_or_later,
       sum(ol.quantity) AS qty,
       min(ol.delivery_date) AS first_date,
       max(ol.delivery_date) AS last_date
FROM order_lines ol
JOIN weeks w     ON w.id = ol.week_id
JOIN customers c ON c.id = ol.customer_id
WHERE ol.delivery_date NOT BETWEEN w.start_date AND w.start_date + 6
GROUP BY c.name
ORDER BY stray_lines DESC;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. BACK UP every stray line (kept for billing questions about past weeks)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE order_lines_backup_out_of_week AS
SELECT ol.*
FROM order_lines ol
JOIN weeks w ON w.id = ol.week_id
WHERE ol.delivery_date NOT BETWEEN w.start_date AND w.start_date + 6;

SELECT count(*), sum(quantity) FROM order_lines_backup_out_of_week;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. DELETE them (the audit trigger logs each delete, migration 059)
-- ════════════════════════════════════════════════════════════════════════════
DELETE FROM order_lines WHERE id IN (SELECT id FROM order_lines_backup_out_of_week);

-- Should return no rows:
SELECT ol.id
FROM order_lines ol
JOIN weeks w ON w.id = ol.week_id
WHERE ol.delivery_date NOT BETWEEN w.start_date AND w.start_date + 6;
