-- 038: Loyalty Points / Rewards

CREATE TABLE IF NOT EXISTS tenant_template.loyalty_points (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID NOT NULL REFERENCES tenant_template.customers(id) ON DELETE CASCADE UNIQUE,
  points          INT NOT NULL DEFAULT 0,
  lifetime_points INT NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_template.loyalty_transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES tenant_template.customers(id) ON DELETE CASCADE,
  points      INT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('earn', 'redeem', 'expire', 'adjustment')),
  reference   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer
  ON tenant_template.loyalty_transactions (customer_id, created_at DESC);
