-- Splits the combined 'לחם ולחמניות' category into 'לחם' (Bread) and
-- 'לחמניות' (Rolls) per the reference lists the client's baker (Dor)
-- provided. Any menu_items row not named in either list keeps its current
-- category untouched (it'll just surface in the app's leftover-category
-- bucket, still visibly labeled, if it was 'לחם ולחמניות' and got missed).
--
-- Uses dollar-quoted string literals throughout (nested under a distinctly
-- tagged $body$ block) to sidestep any ambiguity between a literal
-- apostrophe and a Hebrew geresh in names like "ג'בטות"/"פוקצ'ה" -- no
-- escaping to get wrong either way.
--
-- A DO block + RAISE NOTICE per item means re-running this in the SQL
-- editor surfaces exactly which names (if any) didn't match a real row --
-- e.g. if the live spelling differs from the reference list by a letter --
-- instead of a silent no-op update.
DO $body$
DECLARE
  rolls text[] := ARRAY[
    $$בגט+ ג'בטות$$,
    $$לחמניית בייגלה$$,
    $$לחמניית פרעצל$$,
    $$לחמניית פרעצל (ביס)$$,
    $$בריוש מלבני$$,
    $$בריוש עגול$$,
    $$חלה (שישי/שבת)$$,
    $$לחמניית חלה (ביס)$$
  ];
  breads text[] := ARRAY[
    $$פוקצ'ה כריכים 60/40$$,
    $$לחם כוסמין$$,
    $$לחם נורווגי$$,
    $$קסטן נורווגי 1850$$,
    $$קסטן נורווגי$$,
    $$לחם שיפון אגוזים$$,
    $$פיצה$$,
    $$קסטן בריוש 1200$$,
    $$קסטן בריוש 600$$,
    $$מחמצת זיתים פרמזן$$,
    $$לחם כפרי$$,
    $$לחם מחמצת פקאן$$,
    $$מחמצת לבן$$,
    $$לחם מלא 100%$$,
    $$מחמצת שיפון 100%$$,
    $$לחם ללא גלוטן$$,
    $$לחם בריאות (חמניה)$$
  ];
  item text;
  updated integer;
BEGIN
  FOREACH item IN ARRAY rolls LOOP
    UPDATE menu_items SET category = 'לחמניות' WHERE name_he = item;
    GET DIAGNOSTICS updated = ROW_COUNT;
    IF updated = 0 THEN
      RAISE NOTICE 'No menu_items row matched (Rolls): %', item;
    END IF;
  END LOOP;

  FOREACH item IN ARRAY breads LOOP
    UPDATE menu_items SET category = 'לחם' WHERE name_he = item;
    GET DIAGNOSTICS updated = ROW_COUNT;
    IF updated = 0 THEN
      RAISE NOTICE 'No menu_items row matched (Bread): %', item;
    END IF;
  END LOOP;
END $body$;
