-- 037: Subscriptions / Recurring Orders

CREATE TABLE IF NOT EXISTS tenant_template.subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id           UUID NOT NULL REFERENCES tenant_template.customers(id) ON DELETE CASCADE,
  product_id            UUID NOT NULL REFERENCES tenant_template.products(id) ON DELETE CASCADE,
  variant_id            UUID REFERENCES tenant_template.product_variants(id) ON DELETE SET NULL,
  interval              TEXT NOT NULL CHECK (interval IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  quantity              INT NOT NULL DEFAULT 1,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  stripe_subscription_id TEXT,
  next_billing_at       TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_customer
  ON tenant_template.subscriptions (customer_id, status);
