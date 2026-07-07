-- The Production page's status toggle was simplified from a 3-state cycle
-- (pending/in_progress/done) to a 2-state one (pending/done) -- the UI no
-- longer has a label/color for 'in_progress', so any existing row with
-- that status would render with a blank chip. Normalize back to pending
-- (i.e. "not done yet"), which is what it always meant in practice.
UPDATE production_checks SET status = 'pending' WHERE status = 'in_progress';
