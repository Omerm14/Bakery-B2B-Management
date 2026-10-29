-- Inactive items can't be ordered, and deactivating one clears it from
-- today onward (migration 061).
DO $$
DECLARE
  c uuid := test.customer('guard');
  item uuid := test.item('to retire');
  l uuid;
  rejected boolean := false;
BEGIN
  INSERT INTO order_lines (week_id, customer_id, menu_item_id, delivery_date, quantity, source, status)
  VALUES (test.week(test.this_week() + 7), c, item, test.this_week() + 8, 5, 'manual', 'ok')
  RETURNING id INTO l;

  UPDATE menu_items SET active = false WHERE id = item;
  PERFORM test.eq((SELECT quantity FROM order_lines WHERE id = l), 0::numeric, 'future line zeroed on deactivate');

  BEGIN
    UPDATE order_lines SET quantity = 3 WHERE id = l;
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  PERFORM test.eq(rejected, true, 'raising quantity of an inactive item is rejected');
END $$;
