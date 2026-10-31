-- Initial worker names for the waste log's "thrown by" dropdown. Managed
-- afterwards from Settings › Workers. Re-running skips names already there
-- (the unique index ignores case and surrounding spaces).
INSERT INTO waste_workers (name)
SELECT n FROM unnest(ARRAY[
  'עמית דיבקר',
  'אניה דידקין',
  'מאיה עפרון',
  'הדס סעדי',
  'אסתי גניס',
  'רייצ׳ל איפרגן',
  'דימה יבטושנקו',
  'מוחמד איעד',
  'איסורו',
  'דור',
  'ניקו'
]) AS n
ON CONFLICT ((lower(btrim(name)))) DO NOTHING;
