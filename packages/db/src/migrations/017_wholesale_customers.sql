-- Migration 017: Wholesale customer support
-- Adds is_wholesale flag to customers and wholesale_only flag to products

-- 1. Add wholesale flags to tenant_template
ALTER TABLE tenant_template.customers
  ADD COLUMN IF NOT EXISTS is_wholesale BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE tenant_template.products
  ADD COLUMN IF NOT EXISTS wholesale_only BOOLEAN NOT NULL DEFAULT false;

-- 2. Patch all existing tenant schemas
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT schema_name FROM information_schema.schemata
           WHERE schema_name LIKE 'tenant_%' AND schema_name <> 'tenant_template'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.customers ADD COLUMN IF NOT EXISTS is_wholesale BOOLEAN NOT NULL DEFAULT false',
      r.schema_name);
    EXECUTE format(
      'ALTER TABLE %I.products ADD COLUMN IF NOT EXISTS wholesale_only BOOLEAN NOT NULL DEFAULT false',
      r.schema_name);
  END LOOP;
END $$;
