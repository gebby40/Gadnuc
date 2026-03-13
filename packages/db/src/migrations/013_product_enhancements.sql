-- 013_product_enhancements.sql
-- Add product fields for sale pricing, dimensions, shipping, tags, brand, featured flag.

ALTER TABLE tenant_template.products
  ADD COLUMN IF NOT EXISTS sale_price_cents INT,
  ADD COLUMN IF NOT EXISTS weight_oz       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS length_in       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS width_in        NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS height_in       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS shipping_class  TEXT DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS tags            TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS brand           TEXT,
  ADD COLUMN IF NOT EXISTS is_featured     BOOLEAN NOT NULL DEFAULT false;

-- Apply the same columns to every existing tenant schema
DO $$
DECLARE
  _schema TEXT;
BEGIN
  FOR _schema IN
    SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant\_%' AND nspname != 'tenant_template'
  LOOP
    EXECUTE format('ALTER TABLE %I.products ADD COLUMN IF NOT EXISTS sale_price_cents INT', _schema);
    EXECUTE format('ALTER TABLE %I.products ADD COLUMN IF NOT EXISTS weight_oz       NUMERIC(10,2)', _schema);
    EXECUTE format('ALTER TABLE %I.products ADD COLUMN IF NOT EXISTS length_in       NUMERIC(10,2)', _schema);
    EXECUTE format('ALTER TABLE %I.products ADD COLUMN IF NOT EXISTS width_in        NUMERIC(10,2)', _schema);
    EXECUTE format('ALTER TABLE %I.products ADD COLUMN IF NOT EXISTS height_in       NUMERIC(10,2)', _schema);
    EXECUTE format('ALTER TABLE %I.products ADD COLUMN IF NOT EXISTS shipping_class  TEXT DEFAULT ''standard''', _schema);
    EXECUTE format('ALTER TABLE %I.products ADD COLUMN IF NOT EXISTS tags            TEXT[] DEFAULT ''{}''', _schema);
    EXECUTE format('ALTER TABLE %I.products ADD COLUMN IF NOT EXISTS brand           TEXT', _schema);
    EXECUTE format('ALTER TABLE %I.products ADD COLUMN IF NOT EXISTS is_featured     BOOLEAN NOT NULL DEFAULT false', _schema);
    RAISE NOTICE 'Updated schema: %', _schema;
  END LOOP;
END
$$;
