-- 029: Abandoned Carts — track carts that don't complete checkout

CREATE TABLE IF NOT EXISTS tenant_template.abandoned_carts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID REFERENCES tenant_template.customers(id) ON DELETE SET NULL,
  email        TEXT,
  cart_data    JSONB NOT NULL DEFAULT '[]',
  total_cents  INT NOT NULL DEFAULT 0,
  reminded_at  TIMESTAMPTZ,
  reminder_count INT NOT NULL DEFAULT 0,
  recovered_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_email
  ON tenant_template.abandoned_carts (email);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_created
  ON tenant_template.abandoned_carts (created_at DESC);
