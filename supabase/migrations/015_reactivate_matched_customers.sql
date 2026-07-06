-- Migration 014 deactivated every customer not exactly matching a supplied
-- keep-list of 24 names. Ten of those names didn't match verbatim because
-- the database stores a shorter/different form of the same real customer
-- (missing location suffix, missing prefix, quote-mark variant, etc.).
-- Resolved by manual cross-reference with the business owner:
--
--   קאלדי קפה יפו    -> קאלדי            (best guess vs. alternative קפה קלדי)
--   סתיו פליסקוב     -> קפסיטו
--   פטי ור            -> קורנר-פטיוור קפה
--   ווינברי           -> אנסטסיה
--   לאבאיט דיזינגוף   -> לאבאיט
--   שה שאנטל          -> שאנטל
--   מיצי בשוק         -> מיצי
--   ליגורי בית אלאיה  -> בית אלאיה (ליגורי)
--   ביץ קלאב          -> ביץ' קלאב
--   שולחנות חדשים     -> עורכת שולחן
--
-- This reactivates all ten so their order history counts again in every
-- aggregate view.

UPDATE customers
SET active = true
WHERE trim(name) IN (
  'קאלדי',
  'קפסיטו',
  'קורנר-פטיוור קפה',
  'אנסטסיה',
  'לאבאיט',
  'שאנטל',
  'מיצי',
  'בית אלאיה (ליגורי)',
  'ביץ'' קלאב',
  'עורכת שולחן'
);
