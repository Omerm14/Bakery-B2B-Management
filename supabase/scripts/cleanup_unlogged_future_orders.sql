-- Find and clean up "phantom" future orders: order lines written before the
-- change log existed (2026-07-06), mostly by a bulk import of LAST year's
-- order sheets whose dates had no year and were stamped with the current
-- year (fixed in ImportContext.jsx). They look like real orders, carry no
-- history, and block the Wednesday auto-copy from filling those cells.
--
-- A "suspect" line = a future order line with NO 'insert' event in
-- order_line_audit. Every write since logging began has one, so only
-- pre-log data can match.
--
-- NOT a migration -- run by hand in the Supabase SQL editor, one section at
-- a time, in order. Sections 1-2 only read. Sections 3-5 write, and back up
-- first.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. OVERVIEW — how many suspect lines, per week and customer
-- ════════════════════════════════════════════════════════════════════════════
WITH cw AS (SELECT current_date - extract(dow FROM current_date)::int AS this_week)
SELECT w.start_date AS week_start,
       CASE WHEN w.start_date <= cw.this_week     THEN '1 THIS WEEK — fix by hand'
            WHEN w.start_date  = cw.this_week + 7 THEN '2 NEXT WEEK — section 4'
            ELSE                                       '3 LATER — section 3' END AS action,
       c.name AS customer,
       count(*) AS suspect_lines,
       sum(ol.quantity) AS suspect_qty,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM order_line_audit a WHERE a.order_line_id = ol.id)) AS already_edited
FROM order_lines ol
JOIN customers c ON c.id = ol.customer_id
JOIN weeks w     ON w.id = ol.week_id
CROSS JOIN cw
WHERE ol.delivery_date >= current_date
  AND NOT EXISTS (SELECT 1 FROM order_line_audit a WHERE a.order_line_id = ol.id AND a.action = 'insert')
GROUP BY 1, 2, 3
ORDER BY 1, 3;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. DETAIL — each suspect line next to the customer's previous-week quantity
--    for the same item and weekday (what the auto-copy would have put there).
--    Use this list to fix THIS WEEK by hand in the orders grid.
-- ════════════════════════════════════════════════════════════════════════════
SELECT w.start_date AS week_start, c.name AS customer, mi.name_he AS item,
       ol.delivery_date, to_char(ol.delivery_date, 'Dy') AS day,
       ol.quantity AS suspect_qty,
       prev.quantity AS prev_week_qty,
       EXISTS (SELECT 1 FROM order_line_audit a WHERE a.order_line_id = ol.id) AS already_edited
FROM order_lines ol
JOIN customers c   ON c.id  = ol.customer_id
JOIN menu_items mi ON mi.id = ol.menu_item_id
JOIN weeks w       ON w.id  = ol.week_id
LEFT JOIN order_lines prev ON prev.customer_id = ol.customer_id
                          AND prev.menu_item_id = ol.menu_item_id
                          AND prev.delivery_date = ol.delivery_date - 7
WHERE ol.delivery_date >= current_date
  AND NOT EXISTS (SELECT 1 FROM order_line_audit a WHERE a.order_line_id = ol.id AND a.action = 'insert')
  -- AND w.start_date = current_date - extract(dow FROM current_date)::int   -- this week only
ORDER BY w.start_date, c.name, mi.name_he, ol.delivery_date;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. LATER WEEKS (2+ weeks ahead) — remove untouched suspect lines.
--    Nothing real exists there yet; each Wednesday's auto-copy will fill
--    those cells normally once they're empty. Lines anyone has edited since
--    logging began are kept.
-- ════════════════════════════════════════════════════════════════════════════
-- 3a. Backup
CREATE TABLE order_lines_backup_phantom_later AS
SELECT ol.* FROM order_lines ol
JOIN weeks w ON w.id = ol.week_id
WHERE w.start_date >= current_date - extract(dow FROM current_date)::int + 14
  AND NOT EXISTS (SELECT 1 FROM order_line_audit a WHERE a.order_line_id = ol.id);

-- 3b. Check the count matches section 1's "LATER" rows
SELECT count(*), sum(quantity) FROM order_lines_backup_phantom_later;

-- 3c. Delete exactly the backed-up rows (each delete is logged by migration 059)
DELETE FROM order_lines WHERE id IN (SELECT id FROM order_lines_backup_phantom_later);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. NEXT WEEK — remove untouched suspect lines, then refill them from THIS
--    week exactly as the Wednesday auto-copy would have.
--    ⚠ Run only AFTER this week has been fixed by hand (section 2), because
--      the refill copies this week's quantities forward.
-- ════════════════════════════════════════════════════════════════════════════
-- 4a. Backup
CREATE TABLE order_lines_backup_phantom_next AS
SELECT ol.* FROM order_lines ol
JOIN weeks w ON w.id = ol.week_id
WHERE w.start_date = current_date - extract(dow FROM current_date)::int + 7
  AND NOT EXISTS (SELECT 1 FROM order_line_audit a WHERE a.order_line_id = ol.id);

SELECT count(*), sum(quantity) FROM order_lines_backup_phantom_next;

-- 4b. Delete them
DELETE FROM order_lines WHERE id IN (SELECT id FROM order_lines_backup_phantom_next);

-- 4c. Refill the now-empty cells from this week — same rules as
--     run_weekly_rollover(): active customers with auto_sync on, qty > 0,
--     not marked one-time, never overwriting an existing cell.
INSERT INTO order_lines (week_id, customer_id, menu_item_id, delivery_date, quantity,
  source, status, change_reason, change_note, changed_by, changed_via, updated_at)
SELECT nw.id, ol.customer_id, ol.menu_item_id, ol.delivery_date + 7, ol.quantity,
  'manual', 'ok', 'auto_copy', 'הועתק מחדש לאחר ניקוי הזמנות ישנות מייבוא', 'system:phantom_cleanup',
  'auto_copy_weekly', now()
FROM order_lines ol
JOIN weeks tw    ON tw.id = ol.week_id AND tw.start_date = current_date - extract(dow FROM current_date)::int
JOIN weeks nw    ON nw.start_date = tw.start_date + 7
JOIN customers c ON c.id = ol.customer_id AND c.active AND c.auto_sync
WHERE ol.quantity > 0 AND ol.no_carry_forward IS NOT TRUE
  AND ol.customer_id IN (SELECT DISTINCT customer_id FROM order_lines_backup_phantom_next)
ON CONFLICT (week_id, customer_id, menu_item_id, delivery_date) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. VERIFY — re-run section 1. Only THIS WEEK rows should remain, and their
--    already_edited count should equal suspect_lines once staff have
--    reviewed every line.
--
-- Once you're satisfied, drop the backups:
--   DROP TABLE order_lines_backup_phantom_later;
--   DROP TABLE order_lines_backup_phantom_next;
-- To undo section 3 or 4 instead:
--   INSERT INTO order_lines SELECT * FROM order_lines_backup_phantom_later;
-- ════════════════════════════════════════════════════════════════════════════
