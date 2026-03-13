-- 014_discount_rules.sql
-- Add sale date range columns to products and create discount_rules table.

-- 1. Sale date range on products (tenant_template)
ALTER TABLE tenant_template.products
  ADD COLUMN IF NOT EXISTS sale_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sale_end   TIMESTAMPTZ;

-- 2. Discount rules table (tenant_template)
CREATE TABLE IF NOT EXISTS tenant_template.discount_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('percentage', 'fixed', 'bogo')),
  value       NUMERIC(10,2) NOT NULL,
  min_qty     INT DEFAULT 1,
  category    TEXT,
  product_id  UUID,
  is_active   BOOLEAN DEFAULT true,
  starts_at   TIMESTAMPTZ,
  ends_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 3. Apply to all existing tenant schemas
DO $$
DECLARE
  _schema TEXT;
BEGIN
  FOR _schema IN
    SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant\_%' AND nspname != 'tenant_template'
  LOOP
    -- Sale date columns
    EXECUTE format('ALTER TABLE %I.products ADD COLUMN IF NOT EXISTS sale_start TIMESTAMPTZ', _schema);
    EXECUTE format('ALTER TABLE %I.products ADD COLUMN IF NOT EXISTS sale_end   TIMESTAMPTZ', _schema);

    -- Discount rules table
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.discount_rules (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        TEXT NOT NULL,
        type        TEXT NOT NULL CHECK (type IN (''percentage'', ''fixed'', ''bogo'')),
        value       NUMERIC(10,2) NOT NULL,
        min_qty     INT DEFAULT 1,
        category    TEXT,
        product_id  UUID,
        is_active   BOOLEAN DEFAULT true,
        starts_at   TIMESTAMPTZ,
        ends_at     TIMESTAMPTZ,
        created_at  TIMESTAMPTZ DEFAULT now(),
        updated_at  TIMESTAMPTZ DEFAULT now()
      )', _schema);

    RAISE NOTICE 'Updated schema: %', _schema;
  END LOOP;
END
$$;
