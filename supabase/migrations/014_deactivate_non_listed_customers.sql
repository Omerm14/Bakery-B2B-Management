-- Deactivate every customer that is not on the approved active-client list.
-- A deactivated customer's orders are excluded from every aggregate view
-- (Weekly, Dashboard, Production, Packing, History) as of the customers!inner
-- active-filter fix — this does not delete anything and is fully reversible
-- via the "פעיל/לא פעיל" toggle on the Settings > לקוחות tab.

-- ── STEP 1 — preview: which currently-active customers will be deactivated ──
-- Run this first and sanity-check the list before running the UPDATE below.
SELECT name
FROM customers
WHERE active = true
  AND trim(name) NOT IN (
    'מנו וינו',
    'קיוסקו',
    'מיצי בשוק',
    'שולחנות חדשים',
    'שה שאנטל',
    'ליגורי בית אלאיה',
    'קפה המסילה',
    'פטי ור',
    'סורסטו',
    'קפה הכרם גני תקווה',
    'קפה 14',
    'סתיו פליסקוב',
    'ווינברי',
    'פראיסו',
    'בוטי דיזינגוף',
    'בוטי שרונה',
    'ביץ קלאב',
    'קפה רדיקל',
    'הוק התבור',
    'הוק טרומפלדור',
    'לאבאיט דיזינגוף',
    'קאלדי קפה יפו',
    'קפה זוהר',
    'גאזטי',
    'קוהי'
  )
ORDER BY name;

-- ── STEP 2 — preview: keep-list entries with NO matching customer ──
-- If any names show up here, they're likely typos in the list (vs. the
-- actual stored name) and that customer would otherwise be deactivated
-- by mistake in step 3.
SELECT keep.name AS keep_list_name
FROM unnest(ARRAY[
    'מנו וינו', 'קיוסקו', 'מיצי בשוק', 'שולחנות חדשים', 'שה שאנטל',
    'ליגורי בית אלאיה', 'קפה המסילה', 'פטי ור', 'סורסטו', 'קפה הכרם גני תקווה',
    'קפה 14', 'סתיו פליסקוב', 'ווינברי', 'פראיסו', 'בוטי דיזינגוף',
    'בוטי שרונה', 'ביץ קלאב', 'קפה רדיקל', 'הוק התבור', 'הוק טרומפלדור',
    'לאבאיט דיזינגוף', 'קאלדי קפה יפו', 'קפה זוהר', 'גאזטי', 'קוהי'
  ]) AS keep(name)
WHERE NOT EXISTS (
  SELECT 1 FROM customers WHERE trim(customers.name) = keep.name
);

-- ── STEP 3 — the actual deactivation. Only run after reviewing steps 1–2. ──
UPDATE customers
SET active = false
WHERE active = true
  AND trim(name) NOT IN (
    'מנו וינו',
    'קיוסקו',
    'מיצי בשוק',
    'שולחנות חדשים',
    'שה שאנטל',
    'ליגורי בית אלאיה',
    'קפה המסילה',
    'פטי ור',
    'סורסטו',
    'קפה הכרם גני תקווה',
    'קפה 14',
    'סתיו פליסקוב',
    'ווינברי',
    'פראיסו',
    'בוטי דיזינגוף',
    'בוטי שרונה',
    'ביץ קלאב',
    'קפה רדיקל',
    'הוק התבור',
    'הוק טרומפלדור',
    'לאבאיט דיזינגוף',
    'קאלדי קפה יפו',
    'קפה זוהר',
    'גאזטי',
    'קוהי'
  );
