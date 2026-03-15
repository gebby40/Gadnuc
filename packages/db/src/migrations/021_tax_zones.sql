-- 021: Tax Zones & Rates — per-region tax calculation

CREATE TABLE IF NOT EXISTS tenant_template.tax_zones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  country     TEXT NOT NULL DEFAULT 'US',
  state       TEXT,
  zip_pattern TEXT,
  priority    INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_template.tax_rates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id     UUID NOT NULL REFERENCES tenant_template.tax_zones(id) ON DELETE CASCADE,
  tax_class   TEXT NOT NULL DEFAULT 'standard' CHECK (tax_class IN ('standard', 'reduced', 'zero')),
  rate_pct    NUMERIC(6,4) NOT NULL DEFAULT 0,
  name        TEXT NOT NULL DEFAULT 'Tax',
  is_compound BOOLEAN NOT NULL DEFAULT false,
  is_shipping BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tax_rates_zone
  ON tenant_template.tax_rates (zone_id);

-- Add tax_cents column to orders to store calculated tax
ALTER TABLE tenant_template.orders
  ADD COLUMN IF NOT EXISTS tax_cents INT NOT NULL DEFAULT 0;
ALTER TABLE tenant_template.orders
  ADD COLUMN IF NOT EXISTS shipping_cents INT NOT NULL DEFAULT 0;
