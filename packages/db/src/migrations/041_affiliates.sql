-- 041: Affiliate Program

CREATE TABLE IF NOT EXISTS tenant_template.affiliates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID REFERENCES tenant_template.customers(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  code            TEXT NOT NULL UNIQUE,
  commission_pct  NUMERIC(5,2) NOT NULL DEFAULT 10,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  total_earnings_cents INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_template.affiliate_referrals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES tenant_template.affiliates(id) ON DELETE CASCADE,
  order_id     UUID REFERENCES tenant_template.orders(id) ON DELETE SET NULL,
  amount_cents INT NOT NULL DEFAULT 0,
  commission_cents INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_affiliate
  ON tenant_template.affiliate_referrals (affiliate_id);
