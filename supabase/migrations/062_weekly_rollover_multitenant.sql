-- Multi-tenant SaaS foundation, step 8: per-org weekly rollover.
--
-- run_weekly_rollover() (migration 051) was a single global function
-- assuming one shared calendar of weeks. Split into a per-org worker plus
-- a looping wrapper that iterates every active organization — chosen over
-- one pg_cron job per org so provisioning a new client later requires
-- zero cron changes; the existing schedule (migration 054,
-- '0 3 * * 3' -> `select run_weekly_rollover()`) keeps working unmodified.
-- Per-org exception handling means one org's bad data can't abort every
-- other org's rollover for the week.
--
-- Note: the order_lines/order_change_notifications INSERTs below don't
-- need organization_id added to their column lists — migration 059's
-- check_order_line_org_consistency()/check_order_change_notification_org_consistency()
-- triggers derive it automatically from customer_id on every insert,
-- regardless of caller.
CREATE OR REPLACE FUNCTION run_weekly_rollover_for_org(p_organization_id uuid) RETURNS void
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_this_week_start date := current_date - extract(dow FROM current_date)::int;
  v_next_week_start date := v_this_week_start + 7;
  v_this_week_id uuid;
  v_next_week_id uuid;
BEGIN
  SELECT id INTO v_this_week_id FROM weeks
  WHERE start_date = v_this_week_start AND organization_id = p_organization_id;

  IF v_this_week_id IS NULL THEN
    RAISE NOTICE 'run_weekly_rollover_for_org: no week row for org % at %, nothing to copy', p_organization_id, v_this_week_start;
    RETURN;
  END IF;

  INSERT INTO weeks (organization_id, start_date, label)
  VALUES (p_organization_id, v_next_week_start, 'שבוע ' || to_char(v_next_week_start, 'DD/MM/YYYY'))
  ON CONFLICT (organization_id, start_date) DO NOTHING
  RETURNING id INTO v_next_week_id;

  IF v_next_week_id IS NULL THEN
    SELECT id INTO v_next_week_id FROM weeks
    WHERE start_date = v_next_week_start AND organization_id = p_organization_id;
  END IF;

  WITH inserted AS (
    INSERT INTO order_lines (week_id, customer_id, menu_item_id, delivery_date, quantity,
      source, status, change_reason, change_note, changed_by, changed_via, updated_at)
    SELECT v_next_week_id, ol.customer_id, ol.menu_item_id, ol.delivery_date + 7, ol.quantity,
      'manual', 'ok', 'auto_copy', 'הועתק אוטומטית ע"י המערכת ביום רביעי', 'system:weekly_rollover',
      'auto_copy_weekly', now()
    FROM order_lines ol
    JOIN customers c ON c.id = ol.customer_id AND c.active
    WHERE ol.week_id = v_this_week_id AND ol.quantity > 0 AND ol.organization_id = p_organization_id
    ON CONFLICT (week_id, customer_id, menu_item_id, delivery_date) DO NOTHING
    RETURNING customer_id
  )
  INSERT INTO order_change_notifications (customer_id, week_id, created_at)
  SELECT DISTINCT customer_id, v_next_week_id, now() FROM inserted;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION run_weekly_rollover() RETURNS void
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org record;
BEGIN
  FOR v_org IN SELECT id FROM organizations WHERE active LOOP
    BEGIN
      PERFORM run_weekly_rollover_for_org(v_org.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'run_weekly_rollover: organization % failed: %', v_org.id, SQLERRM;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
