-- Delete every future order line left over from the 2026-07-01 wrong-year
-- Excel import that nobody has touched since, then refill NEXT week's
-- emptied cells from THIS week's order exactly as the Wednesday auto-copy
-- (run_weekly_rollover) would have. That job already ran for next week and
-- won't run for it again; later weeks need no refill — each Wednesday's job
-- fills the following week, and it can only fill EMPTY cells (ON CONFLICT DO
-- NOTHING), which is why the old lines have to go.
--
-- "Untouched old-import line" = future order line with NO row at all in
-- order_line_audit (same as already_edited_by_staff = false in the report).
-- Lines staff already corrected have audit rows and are kept.
--
-- NOT a migration -- run by hand in the Supabase SQL editor, one section at
-- a time, in order. Sections 1 and 5 only read.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. PREVIEW — what will be deleted, per week and customer
-- ════════════════════════════════════════════════════════════════════════════
SELECT w.start_date AS week_start, c.name AS customer, c.active AS customer_active,
       count(*) AS lines_to_delete, trim_scale(sum(ol.quantity)) AS units_to_delete
FROM order_lines ol
JOIN weeks w     ON w.id = ol.week_id
JOIN customers c ON c.id = ol.customer_id
WHERE ol.delivery_date >= current_date
  AND NOT EXISTS (SELECT 1 FROM order_line_audit a WHERE a.order_line_id = ol.id)
GROUP BY 1, 2, 3
ORDER BY 1, 2;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. BACKUP — exact copy of every line about to be deleted
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE order_lines_backup_import_cleanup AS
SELECT ol.* FROM order_lines ol
WHERE ol.delivery_date >= current_date
  AND NOT EXISTS (SELECT 1 FROM order_line_audit a WHERE a.order_line_id = ol.id);

-- Check: must match the total of section 1 before you continue
SELECT count(*) AS lines, trim_scale(sum(quantity)) AS units FROM order_lines_backup_import_cleanup;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. DELETE — exactly the backed-up rows
-- ════════════════════════════════════════════════════════════════════════════
DELETE FROM order_lines WHERE id IN (SELECT id FROM order_lines_backup_import_cleanup);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. REFILL NEXT WEEK — only the cells just emptied, from this week's order
--    for the same customer, item and weekday. Same rules as
--    run_weekly_rollover(): active customers with auto_sync on, qty > 0,
--    not marked one-time, never overwriting an existing cell. A cell whose
--    customer didn't order that item this week stays empty. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO order_lines (week_id, customer_id, menu_item_id, delivery_date, quantity,
  source, status, change_reason, change_note, changed_by, changed_via, updated_at)
SELECT b.week_id, b.customer_id, b.menu_item_id, b.delivery_date, cur.quantity,
  'manual', 'ok', 'auto_copy', 'הועתק משבוע קודם לאחר ניקוי הזמנות ישנות מייבוא',
  'system:import_cleanup', 'auto_copy_weekly', now()
FROM order_lines_backup_import_cleanup b
JOIN weeks nw ON nw.id = b.week_id
  AND nw.start_date = current_date - extract(dow FROM current_date)::int + 7
JOIN weeks tw ON tw.start_date = nw.start_date - 7
JOIN order_lines cur ON cur.week_id = tw.id
  AND cur.customer_id = b.customer_id
  AND cur.menu_item_id = b.menu_item_id
  AND cur.delivery_date = b.delivery_date - 7
JOIN customers c ON c.id = b.customer_id AND c.active AND c.auto_sync
WHERE cur.quantity > 0 AND cur.no_carry_forward IS NOT TRUE
ON CONFLICT (week_id, customer_id, menu_item_id, delivery_date) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. VERIFY
-- ════════════════════════════════════════════════════════════════════════════
-- 5a. Left over from the import: should be only lines staff already edited
SELECT w.start_date AS week_start, c.name AS customer, count(*) AS remaining_lines
FROM order_lines ol
JOIN weeks w     ON w.id = ol.week_id
JOIN customers c ON c.id = ol.customer_id
WHERE ol.delivery_date >= current_date
  AND NOT EXISTS (SELECT 1 FROM order_line_audit a WHERE a.order_line_id = ol.id AND a.action = 'insert')
GROUP BY 1, 2 ORDER BY 1, 2;

-- 5b. Next week per customer: old imported units vs. units after the refill
WITH nw AS (SELECT id FROM weeks WHERE start_date = current_date - extract(dow FROM current_date)::int + 7)
SELECT c.name AS customer,
       trim_scale(COALESCE((SELECT sum(b.quantity) FROM order_lines_backup_import_cleanup b
                             WHERE b.customer_id = c.id AND b.week_id = (SELECT id FROM nw)), 0)) AS old_import_units,
       trim_scale(COALESCE((SELECT sum(ol.quantity) FROM order_lines ol
                             WHERE ol.customer_id = c.id AND ol.week_id = (SELECT id FROM nw)
                               AND ol.changed_by = 'system:import_cleanup'), 0)) AS refilled_units,
       trim_scale(COALESCE((SELECT sum(ol.quantity) FROM order_lines ol
                             WHERE ol.customer_id = c.id AND ol.week_id = (SELECT id FROM nw)), 0)) AS next_week_total_now
FROM customers c
WHERE c.id IN (SELECT customer_id FROM order_lines_backup_import_cleanup WHERE week_id = (SELECT id FROM nw))
ORDER BY old_import_units DESC;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. UNDO (only if needed) — remove the refill, restore the deleted rows
-- ════════════════════════════════════════════════════════════════════════════
--   DELETE FROM order_lines WHERE changed_by = 'system:import_cleanup';
--   INSERT INTO order_lines SELECT * FROM order_lines_backup_import_cleanup;
--
-- Once everything looks right, the backups can go:
--   DROP TABLE order_lines_backup_import_cleanup;
--   DROP TABLE order_lines_backup_phantom_next;   -- from the earlier step 4a
