-- Waste log constraints (migration 067).
DO $$
DECLARE
  w uuid;
  item uuid := test.item('waste test croissant');
  r uuid;
  rejected boolean;
BEGIN
  INSERT INTO waste_workers (name) VALUES ('Test Worker') RETURNING id INTO w;

  INSERT INTO waste_log (item_name, menu_item_id, quantity, unit, reason, worker_id)
  VALUES ('קרואסון', item, 6, 'units', 'נשרף', w) RETURNING id INTO r;
  PERFORM test.eq((SELECT waste_date FROM waste_log WHERE id = r), current_date, 'date defaults to today');

  INSERT INTO waste_log (item_name, quantity, unit, worker_id) VALUES ('בצק עלים', 2.5, 'kg', w);
  PERFORM test.eq((SELECT count(*) FROM waste_log WHERE worker_id = w), 2::bigint, 'kg accepts decimals, reason optional');

  rejected := false;
  BEGIN
    INSERT INTO waste_log (item_name, quantity, unit, worker_id) VALUES ('חלה', 1.5, 'units', w);
  EXCEPTION WHEN check_violation THEN rejected := true;
  END;
  PERFORM test.eq(rejected, true, 'fractional units are rejected');

  rejected := false;
  BEGIN
    INSERT INTO waste_log (item_name, quantity, unit, worker_id) VALUES ('חלה', 0, 'units', w);
  EXCEPTION WHEN check_violation THEN rejected := true;
  END;
  PERFORM test.eq(rejected, true, 'zero quantity is rejected');

  rejected := false;
  BEGIN
    INSERT INTO waste_log (item_name, quantity, unit, worker_id) VALUES ('   ', 1, 'units', w);
  EXCEPTION WHEN check_violation THEN rejected := true;
  END;
  PERFORM test.eq(rejected, true, 'blank item name is rejected');

  rejected := false;
  BEGIN
    INSERT INTO waste_workers (name) VALUES (' test worker ');
  EXCEPTION WHEN unique_violation THEN rejected := true;
  END;
  PERFORM test.eq(rejected, true, 'worker names are unique ignoring case and spaces');

  rejected := false;
  BEGIN
    DELETE FROM waste_workers WHERE id = w;
  EXCEPTION WHEN foreign_key_violation THEN rejected := true;
  END;
  PERFORM test.eq(rejected, true, 'a worker with waste rows cannot be deleted');

  DELETE FROM menu_items WHERE id = item;
  PERFORM test.eq((SELECT menu_item_id FROM waste_log WHERE id = r), NULL::uuid, 'deleting the catalog item keeps the waste row');
END $$;
