-- 016_customer_accounts.sql
-- Add customer accounts table + link orders to customers

-- 1. Create customers table in tenant_template
CREATE TABLE IF NOT EXISTS tenant_template.customers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email            TEXT NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL,
  first_name       TEXT,
  last_name        TEXT,
  phone            TEXT,
  default_address  JSONB,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  last_login_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Add customer_id FK to orders (nullable for existing/guest orders)
ALTER TABLE tenant_template.orders
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES tenant_template.customers(id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON tenant_template.orders(customer_id);

-- 3. Patch all existing tenant schemas
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT schema_name FROM information_schema.schemata
           WHERE schema_name LIKE 'tenant_%' AND schema_name <> 'tenant_template'
  LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I.customers (
         id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         email            TEXT NOT NULL UNIQUE,
         password_hash    TEXT NOT NULL,
         first_name       TEXT,
         last_name        TEXT,
         phone            TEXT,
         default_address  JSONB,
         is_active        BOOLEAN NOT NULL DEFAULT true,
         last_login_at    TIMESTAMPTZ,
         created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
         updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
       )', r.schema_name);
    EXECUTE format(
      'ALTER TABLE %I.orders ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES %I.customers(id)',
      r.schema_name, r.schema_name);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON %I.orders(customer_id)',
      r.schema_name);
  END LOOP;
END $$;
