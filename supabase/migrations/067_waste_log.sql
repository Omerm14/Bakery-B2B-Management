-- Waste log ("זריקות"): what was thrown away, when, why and by whom.
--
-- waste_workers  the names offered in the "who threw it" dropdown. Floor
--                staff usually share one login, so the thrower is picked from
--                this list rather than taken from the session. A worker who
--                leaves is hidden (active = false), never deleted, so their
--                past rows keep a name.
-- waste_log      one row per thrown item. item_name is free text; when it
--                matches a catalog item the app also stores menu_item_id so
--                reports can group spelling variants together. Quantity is
--                either whole units or kilograms.

CREATE TABLE IF NOT EXISTS waste_workers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 1 and 80),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
CREATE UNIQUE INDEX IF NOT EXISTS waste_workers_name_key ON waste_workers (lower(btrim(name)));

CREATE TABLE IF NOT EXISTS waste_log (
  id           uuid primary key default gen_random_uuid(),
  waste_date   date not null default current_date,
  item_name    text not null check (length(btrim(item_name)) between 1 and 200),
  menu_item_id uuid references menu_items(id) on delete set null,
  quantity     numeric(10,2) not null check (quantity > 0),
  unit         text not null check (unit in ('units', 'kg')),
  reason       text check (reason is null or length(reason) <= 500),
  worker_id    uuid not null references waste_workers(id) on delete restrict,
  created_by   text default (auth.jwt() ->> 'email'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Units are counted whole; only kilograms take decimals.
  CONSTRAINT waste_log_whole_units CHECK (unit <> 'units' OR quantity = trunc(quantity))
);
CREATE INDEX IF NOT EXISTS waste_log_date_idx ON waste_log (waste_date desc, created_at desc);
CREATE INDEX IF NOT EXISTS waste_log_menu_item_idx ON waste_log (menu_item_id) WHERE menu_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS waste_log_worker_idx ON waste_log (worker_id);

CREATE OR REPLACE FUNCTION waste_log_touch() RETURNS trigger
SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS waste_log_touch ON waste_log;
CREATE TRIGGER waste_log_touch BEFORE UPDATE ON waste_log
  FOR EACH ROW EXECUTE FUNCTION waste_log_touch();

-- Staff only, like the rest of the back office; portal customers see nothing.
ALTER TABLE waste_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE waste_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_all" ON waste_workers;
CREATE POLICY "staff_all" ON waste_workers FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());
DROP POLICY IF EXISTS "staff_all" ON waste_log;
CREATE POLICY "staff_all" ON waste_log FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());
