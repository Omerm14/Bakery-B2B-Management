-- Bakery B2B Management System — Initial Schema

-- Suppliers (raw-material suppliers)
create table if not exists suppliers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  contact_info text,
  created_at  timestamptz default now()
);

-- Customers (B2B wholesale clients)
create table if not exists customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,           -- WhatsApp E.164 format e.g. +972501234567
  active      boolean not null default true,
  notes       text,
  created_at  timestamptz default now()
);

-- Menu items
create table if not exists menu_items (
  id          uuid primary key default gen_random_uuid(),
  name_he     text not null,  -- Hebrew name (primary)
  name_en     text,           -- English name (optional)
  unit        text not null default 'יח׳',  -- e.g. יח׳, ק״ג, מגש
  category    text,           -- e.g. מאפים, עוגות, לחם
  supplier_id uuid references suppliers(id) on delete set null,
  active      boolean not null default true,
  created_at  timestamptz default now()
);

-- Weeks (working periods)
create table if not exists weeks (
  id          uuid primary key default gen_random_uuid(),
  start_date  date not null unique,  -- Always Sunday
  label       text,
  created_at  timestamptz default now()
);

-- Order lines (core table — all orders live here)
create table if not exists order_lines (
  id              uuid primary key default gen_random_uuid(),
  week_id         uuid not null references weeks(id) on delete cascade,
  customer_id     uuid not null references customers(id) on delete cascade,
  menu_item_id    uuid not null references menu_items(id) on delete cascade,
  delivery_date   date not null,          -- specific delivery day (within the week)
  quantity        numeric(10,2) not null default 0,
  source          text not null default 'manual' check (source in ('manual', 'noga')),
  status          text not null default 'ok' check (status in ('ok', 'needs_review')),
  noga_message_id uuid,                   -- FK to noga_messages added in phase 2
  updated_at      timestamptz default now(),
  created_at      timestamptz default now(),

  -- Upsert key: one line per customer × item × day per week
  unique (week_id, customer_id, menu_item_id, delivery_date)
);

create index if not exists idx_order_lines_week on order_lines(week_id);
create index if not exists idx_order_lines_date on order_lines(delivery_date);
create index if not exists idx_order_lines_customer on order_lines(customer_id);

-- Packing checks (tick-off state per order line per day)
create table if not exists packing_checks (
  id            uuid primary key default gen_random_uuid(),
  order_line_id uuid not null references order_lines(id) on delete cascade,
  packed_at     timestamptz,
  packed_by_session text,
  created_at    timestamptz default now(),

  unique (order_line_id)
);

-- Noga messages (Phase 2 — added now for schema completeness)
create table if not exists noga_messages (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid references customers(id) on delete set null,
  whatsapp_message_id text unique,
  direction           text not null check (direction in ('in', 'out')),
  body_text           text,
  received_at         timestamptz default now(),
  processed_at        timestamptz,
  extraction_result   jsonb
);

-- Add noga_message_id FK now that the table exists
alter table order_lines
  add constraint fk_order_lines_noga_message
  foreign key (noga_message_id) references noga_messages(id) on delete set null;

-- Forecasts (Phase 3 stub)
create table if not exists forecasts (
  id             uuid primary key default gen_random_uuid(),
  menu_item_id   uuid not null references menu_items(id) on delete cascade,
  target_date    date not null,
  projected_qty  numeric(10,2) not null default 0,
  basis          text not null default 'rolling_avg' check (basis in ('rolling_avg', 'standing', 'manual')),
  locked         boolean not null default false,
  created_at     timestamptz default now(),

  unique (menu_item_id, target_date)
);

-- RLS: enable on all tables (users are authenticated via Supabase Auth)
alter table suppliers     enable row level security;
alter table customers     enable row level security;
alter table menu_items    enable row level security;
alter table weeks         enable row level security;
alter table order_lines   enable row level security;
alter table packing_checks enable row level security;
alter table noga_messages enable row level security;
alter table forecasts     enable row level security;

-- Policies: authenticated users can do everything (single shared login)
create policy "auth_all" on suppliers      for all to authenticated using (true) with check (true);
create policy "auth_all" on customers      for all to authenticated using (true) with check (true);
create policy "auth_all" on menu_items     for all to authenticated using (true) with check (true);
create policy "auth_all" on weeks          for all to authenticated using (true) with check (true);
create policy "auth_all" on order_lines    for all to authenticated using (true) with check (true);
create policy "auth_all" on packing_checks for all to authenticated using (true) with check (true);
create policy "auth_all" on noga_messages  for all to authenticated using (true) with check (true);
create policy "auth_all" on forecasts      for all to authenticated using (true) with check (true);
