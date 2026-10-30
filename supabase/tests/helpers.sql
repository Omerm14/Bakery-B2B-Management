-- Loaded after the migrations. Tiny assertion + fixture helpers for the
-- tests in sql/. Kept in their own schema so they never shadow app objects.
CREATE SCHEMA IF NOT EXISTS test;

CREATE OR REPLACE FUNCTION test.eq(actual anyelement, expected anyelement, label text) RETURNS void AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'FAIL: % — expected %, got %', label, expected, actual;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Start of the week run_weekly_rollover() copies FROM (Sunday of current_date).
CREATE OR REPLACE FUNCTION test.this_week() RETURNS date LANGUAGE sql STABLE AS $$
  SELECT current_date - extract(dow FROM current_date)::int
$$;

CREATE OR REPLACE FUNCTION test.week(p_start date) RETURNS uuid AS $$
  INSERT INTO weeks (start_date, label) VALUES (p_start, 'test ' || p_start)
  ON CONFLICT (start_date) DO UPDATE SET label = weeks.label
  RETURNING id
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION test.customer(p_name text, p_active boolean DEFAULT true, p_auto_sync boolean DEFAULT true)
RETURNS uuid AS $$
  INSERT INTO customers (name, active, auto_sync) VALUES (p_name, p_active, p_auto_sync) RETURNING id
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION test.item(p_name text, p_active boolean DEFAULT true) RETURNS uuid AS $$
  INSERT INTO menu_items (name_he, active) VALUES (p_name, p_active) RETURNING id
$$ LANGUAGE sql;

-- Order line for this week's Monday + p_day_offset (0 = Monday).
CREATE OR REPLACE FUNCTION test.line(p_customer uuid, p_item uuid, p_qty numeric, p_day_offset int DEFAULT 0)
RETURNS uuid AS $$
  INSERT INTO order_lines (week_id, customer_id, menu_item_id, delivery_date, quantity, source, status)
  VALUES (test.week(test.this_week()), p_customer, p_item, test.this_week() + 1 + p_day_offset, p_qty, 'manual', 'ok')
  RETURNING id
$$ LANGUAGE sql;

-- Quantity in next week's matching cell (NULL = no row at all).
CREATE OR REPLACE FUNCTION test.next_qty(p_customer uuid, p_item uuid, p_day_offset int DEFAULT 0) RETURNS numeric AS $$
  SELECT quantity FROM order_lines
  WHERE customer_id = p_customer AND menu_item_id = p_item
    AND delivery_date = test.this_week() + 8 + p_day_offset
$$ LANGUAGE sql;
