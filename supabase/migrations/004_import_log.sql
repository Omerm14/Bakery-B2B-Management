CREATE TABLE IF NOT EXISTS import_log (
  id            uuid primary key default gen_random_uuid(),
  file_hash     text not null unique,
  file_name     text,
  imported_at   timestamptz default now(),
  rows_new      int,
  rows_existing int
);
ALTER TABLE import_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON import_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
