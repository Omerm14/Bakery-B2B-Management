-- Production item status tracking
CREATE TABLE IF NOT EXISTS production_checks (
  id            uuid primary key default gen_random_uuid(),
  menu_item_id  uuid not null references menu_items(id) on delete cascade,
  delivery_date date not null,
  status        text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  updated_at    timestamptz default now(),
  unique (menu_item_id, delivery_date)
);

ALTER TABLE production_checks enable row level security;
CREATE POLICY "auth_all" ON production_checks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow 'forecast' as an order source (for Phase 3)
ALTER TABLE order_lines DROP CONSTRAINT IF EXISTS order_lines_source_check;
ALTER TABLE order_lines ADD CONSTRAINT order_lines_source_check
  CHECK (source IN ('manual', 'noga', 'forecast'));
