-- 022: Shipping Zones & Methods

CREATE TABLE IF NOT EXISTS tenant_template.shipping_zones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  countries   JSONB NOT NULL DEFAULT '["US"]',
  states      JSONB NOT NULL DEFAULT '[]',
  zip_patterns JSONB NOT NULL DEFAULT '[]',
  priority    INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_template.shipping_methods (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id         UUID NOT NULL REFERENCES tenant_template.shipping_zones(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('flat_rate', 'free_shipping', 'local_pickup', 'weight_based')),
  title           TEXT NOT NULL DEFAULT 'Shipping',
  cost_cents      INT NOT NULL DEFAULT 0,
  free_above_cents INT,
  per_item_cents  INT DEFAULT 0,
  weight_rate_cents_per_oz INT DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  position        INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipping_methods_zone
  ON tenant_template.shipping_methods (zone_id, position);
