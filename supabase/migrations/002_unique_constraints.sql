-- Add unique constraints needed for Excel import upserts

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_name_key') THEN
    ALTER TABLE customers ADD CONSTRAINT customers_name_key UNIQUE (name);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_name_he_key') THEN
    ALTER TABLE menu_items ADD CONSTRAINT menu_items_name_he_key UNIQUE (name_he);
  END IF;
END $$;
