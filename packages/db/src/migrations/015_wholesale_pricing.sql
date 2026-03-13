-- 015: Wholesale pricing — customer groups + wholesale price on products
-- Applied to tenant_template and all existing tenant schemas.

-- 1. Add wholesale_price_cents to products
ALTER TABLE tenant_template.products
  ADD COLUMN IF NOT EXISTS wholesale_price_cents INT;

-- 2. Create customer_groups table
CREATE TABLE IF NOT EXISTS tenant_template.customer_groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  slug       TEXT NOT NULL UNIQUE,
  discount_pct NUMERIC(5,2) DEFAULT 0,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default groups
INSERT INTO tenant_template.customer_groups (name, slug, is_default)
VALUES ('Retail', 'retail', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO tenant_template.customer_groups (name, slug)
VALUES ('Wholesale', 'wholesale')
ON CONFLICT (slug) DO NOTHING;

-- 3. Apply to all existing tenant schemas
DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN
    SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%' AND nspname <> 'tenant_template'
  LOOP
    EXECUTE format('ALTER TABLE %I.products ADD COLUMN IF NOT EXISTS wholesale_price_cents INT', schema_name);

    EXECUTE format('CREATE TABLE IF NOT EXISTS %I.customer_groups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      discount_pct NUMERIC(5,2) DEFAULT 0,
      is_default BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )', schema_name);

    EXECUTE format(
      'INSERT INTO %I.customer_groups (name, slug, is_default) VALUES (''Retail'', ''retail'', true) ON CONFLICT (slug) DO NOTHING',
      schema_name
    );
    EXECUTE format(
      'INSERT INTO %I.customer_groups (name, slug) VALUES (''Wholesale'', ''wholesale'') ON CONFLICT (slug) DO NOTHING',
      schema_name
    );
  END LOOP;
END
$$;
