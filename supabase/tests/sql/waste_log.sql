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

-- Seeded worker names (migration 068).
DO $$
BEGIN
  PERFORM test.eq((SELECT count(*) FROM waste_workers WHERE name IN (
    'עמית דיבקר', 'אניה דידקין', 'מאיה עפרון', 'הדס סעדי', 'אסתי גניס', 'רייצ׳ל איפרגן',
    'דימה יבטושנקו', 'מוחמד איעד', 'איסורו', 'דור', 'ניקו') AND active), 11::bigint, 'all 11 workers seeded and active');
END $$;

-- Deleting needs the manager code (migration 069).
DO $$
DECLARE
  w uuid;
  r uuid;
  i int;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"email":"dor@bakery.test","app_metadata":{"role":"staff"}}', true);
  SELECT id INTO w FROM waste_workers WHERE name = 'דור';
  INSERT INTO waste_log (item_name, quantity, unit, worker_id) VALUES ('חלה', 3, 'units', w) RETURNING id INTO r;

  PERFORM test.eq((SELECT count(*) FROM pg_policies WHERE tablename = 'waste_log' AND cmd IN ('DELETE', 'ALL')), 0::bigint,
    'staff have no direct delete policy on waste_log');
  PERFORM test.eq(has_function_privilege('authenticated', 'set_waste_admin_code(text)', 'EXECUTE'), false,
    'clients cannot set the manager code');
  PERFORM test.eq(has_function_privilege('authenticated', 'delete_waste_entry(uuid, text)', 'EXECUTE'), true,
    'staff can call delete_waste_entry');

  PERFORM test.eq(delete_waste_entry(r, '1234'), 'no_code', 'no code configured yet');
  PERFORM set_waste_admin_code('2468');
  PERFORM test.eq((SELECT code_hash <> '2468' FROM waste_admin_code), true, 'code is stored hashed');

  PERFORM test.eq(delete_waste_entry(r, '0000'), 'bad_code', 'wrong code is rejected');
  PERFORM test.eq((SELECT count(*) FROM waste_log WHERE id = r), 1::bigint, 'row kept after a wrong code');
  PERFORM test.eq(delete_waste_entry(r, ' 2468 '), 'deleted', 'right code deletes');
  PERFORM test.eq((SELECT count(*) FROM waste_log WHERE id = r), 0::bigint, 'row gone');
  PERFORM test.eq(delete_waste_entry(r, '2468'), 'not_found', 'deleting twice reports not found');

  INSERT INTO waste_log (item_name, quantity, unit, worker_id) VALUES ('חלה', 1, 'units', w) RETURNING id INTO r;
  FOR i IN 1..5 LOOP PERFORM delete_waste_entry(r, 'nope'); END LOOP;
  PERFORM test.eq(delete_waste_entry(r, '2468'), 'locked', 'five wrong codes lock deletes, even with the right code');
  PERFORM set_waste_admin_code('1357');
  PERFORM test.eq(delete_waste_entry(r, '1357'), 'deleted', 'setting a new code clears the lock');

  PERFORM set_config('request.jwt.claims', '{"email":"cust@x","app_metadata":{"role":"customer"}}', true);
  BEGIN
    PERFORM delete_waste_entry(r, '1357');
    RAISE EXCEPTION 'FAIL: non-staff call should be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
