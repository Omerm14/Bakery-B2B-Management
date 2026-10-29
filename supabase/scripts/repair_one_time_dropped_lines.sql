-- Repair order lines that vanished because of the one-time bug fixed in
-- migration 062: a line flagged one-time (no_carry_forward) was skipped by
-- the Wednesday auto-copy instead of coming back at its regular quantity, so
-- the product disappeared from the customer's next week. Since 2026-10-14
-- staff edits defaulted to one-time, so this hit many customers.
--
-- "Regular quantity" of a one-time line = old_quantity of the audit row where
-- its one-time flag last turned on (a brand-new one-time cell -> 0, nothing to
-- restore). Computed from order_line_audit here, so it works for past weeks
-- too (migration 062 only backfills the column from the current week on).
--
-- Run migration 062 FIRST. NOT a migration -- run by hand in the Supabase SQL
-- editor, one section at a time, in order. Sections 1 and 2 only read.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. REPORT — every one-time line since 2026-10-11 whose next-week cell did
--    not come back at the regular quantity. "1 already hit" = the Wednesday
--    auto-copy for that next week already ran (before migration 062, so it
--    skipped the line — the cell stays empty unless repaired in section 3);
--    "2 at risk" = its auto-copy hasn't run yet, so 062 handles it.
-- ════════════════════════════════════════════════════════════════════════════
WITH flagged AS (
  SELECT id, customer_id, menu_item_id, delivery_date, quantity
  FROM order_lines
  WHERE no_carry_forward AND delivery_date >= '2026-10-11'
),
ordered AS (
  SELECT a.order_line_id, a.id, a.created_at, a.old_quantity, a.changed_by, a.changed_via,
         COALESCE(a.no_carry_forward, false) AS on_flag,
         LAG(COALESCE(a.no_carry_forward, false))
           OVER (PARTITION BY a.order_line_id ORDER BY a.created_at, a.id) AS prev_flag
  FROM order_line_audit a
  WHERE a.action IN ('insert', 'update') AND a.order_line_id IN (SELECT id FROM flagged)
),
regular AS (
  SELECT DISTINCT ON (order_line_id) order_line_id,
         COALESCE(old_quantity, 0) AS regular_qty, changed_by, changed_via, created_at
  FROM ordered
  WHERE on_flag AND prev_flag IS DISTINCT FROM true
  ORDER BY order_line_id, created_at DESC, id DESC
)
SELECT CASE WHEN now() >= ((f.delivery_date - extract(dow FROM f.delivery_date)::int + 3)
                           + time '03:00') AT TIME ZONE 'UTC'
            THEN '1 already hit' ELSE '2 at risk' END AS status,
       c.name AS customer, mi.name_he AS item, f.delivery_date,
       trim_scale(r.regular_qty) AS regular_qty, trim_scale(f.quantity) AS one_time_qty,
       f.delivery_date + 7 AS next_date, trim_scale(nx.quantity) AS next_week_qty,
       r.changed_by AS flagged_by, r.changed_via AS flagged_via, r.created_at AS flagged_at
FROM flagged f
JOIN regular r     ON r.order_line_id = f.id
JOIN customers c   ON c.id = f.customer_id
JOIN menu_items mi ON mi.id = f.menu_item_id
LEFT JOIN order_lines nx ON nx.customer_id = f.customer_id
     AND nx.menu_item_id = f.menu_item_id AND nx.delivery_date = f.delivery_date + 7
WHERE r.regular_qty > 0
  AND COALESCE(nx.quantity, 0) <> r.regular_qty
ORDER BY status, customer, f.delivery_date, item;

-- Same report summed per customer: wrap section 1's SELECT as
--   SELECT status, customer, count(*) AS lines, sum(regular_qty) AS units
--   FROM ( ...section 1... ) x GROUP BY 1, 2 ORDER BY 1, 2;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. CANDIDATES — EMPTY cells (no row at all) in the current week from today
--    on and in NEXT week, still before their cutoff, whose line one week
--    earlier was one-time with a regular quantity > 0. Next week is included
--    because its auto-copy already ran (Wednesday of this week) before
--    migration 062 and won't run again. Same rules as run_weekly_rollover():
--    active customer with auto_sync, active item. A cell someone already
--    filled is never touched. Review this list with the floor before section 3.
-- ════════════════════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS one_time_repair_candidates;
CREATE TABLE one_time_repair_candidates AS
WITH this_week AS (SELECT current_date - extract(dow FROM current_date)::int AS start_date),
flagged AS (
  SELECT ol.id, ol.customer_id, ol.menu_item_id, ol.delivery_date, w.start_date AS week_start
  FROM order_lines ol
  JOIN weeks w ON w.id = ol.week_id
  WHERE ol.no_carry_forward
    AND w.start_date IN ((SELECT start_date FROM this_week) - 7, (SELECT start_date FROM this_week))
),
ordered AS (
  SELECT a.order_line_id, a.id, a.created_at, a.old_quantity,
         COALESCE(a.no_carry_forward, false) AS on_flag,
         LAG(COALESCE(a.no_carry_forward, false))
           OVER (PARTITION BY a.order_line_id ORDER BY a.created_at, a.id) AS prev_flag
  FROM order_line_audit a
  WHERE a.action IN ('insert', 'update') AND a.order_line_id IN (SELECT id FROM flagged)
),
regular AS (
  SELECT DISTINCT ON (order_line_id) order_line_id, COALESCE(old_quantity, 0) AS regular_qty
  FROM ordered
  WHERE on_flag AND prev_flag IS DISTINCT FROM true
  ORDER BY order_line_id, created_at DESC, id DESC
)
SELECT tw.id AS week_id, f.customer_id, f.menu_item_id,
       f.delivery_date + 7 AS delivery_date, r.regular_qty AS quantity
FROM flagged f
JOIN regular r     ON r.order_line_id = f.id AND r.regular_qty > 0
JOIN weeks tw      ON tw.start_date = f.week_start + 7
JOIN customers c   ON c.id = f.customer_id AND c.active AND c.auto_sync
JOIN menu_items mi ON mi.id = f.menu_item_id AND mi.active
WHERE f.delivery_date + 7 >= current_date
  AND now() < get_delivery_date_lock_at(f.delivery_date + 7)
  AND NOT EXISTS (SELECT 1 FROM order_lines x
                  WHERE x.customer_id = f.customer_id AND x.menu_item_id = f.menu_item_id
                    AND x.delivery_date = f.delivery_date + 7);

SELECT c.name AS customer, mi.name_he AS item, k.delivery_date, trim_scale(k.quantity) AS quantity
FROM one_time_repair_candidates k
JOIN customers c   ON c.id = k.customer_id
JOIN menu_items mi ON mi.id = k.menu_item_id
ORDER BY customer, k.delivery_date, item;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. RESTORE — insert exactly the candidates, never overwriting a cell that
--    got filled in the meantime, and notify the floor like the auto-copy.
-- ════════════════════════════════════════════════════════════════════════════
WITH inserted AS (
  INSERT INTO order_lines (week_id, customer_id, menu_item_id, delivery_date, quantity,
    source, status, change_reason, change_note, changed_by, changed_via, updated_at)
  SELECT week_id, customer_id, menu_item_id, delivery_date, quantity,
    'manual', 'ok', 'auto_copy', 'שוחזר: שינוי חד-פעמי בשבוע הקודם מחק את הפריט במקום להחזיר לכמות הקבועה',
    'system:one_time_repair', 'auto_copy_weekly', now()
  FROM one_time_repair_candidates
  ON CONFLICT (week_id, customer_id, menu_item_id, delivery_date) DO NOTHING
  RETURNING customer_id, week_id
)
INSERT INTO order_change_notifications (customer_id, week_id, created_at)
SELECT DISTINCT customer_id, week_id, now() FROM inserted;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. VERIFY — restored lines per customer (should match section 2)
-- ════════════════════════════════════════════════════════════════════════════
SELECT c.name AS customer, count(*) AS lines, trim_scale(sum(ol.quantity)) AS units
FROM order_lines ol
JOIN customers c ON c.id = ol.customer_id
WHERE ol.changed_by = 'system:one_time_repair'
GROUP BY 1 ORDER BY 1;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. UNDO (only if needed)
-- ════════════════════════════════════════════════════════════════════════════
--   DELETE FROM order_lines WHERE changed_by = 'system:one_time_repair';
--
-- Once everything looks right:
--   DROP TABLE one_time_repair_candidates;
