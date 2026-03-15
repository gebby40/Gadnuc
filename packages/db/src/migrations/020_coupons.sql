-- 020: Coupon Codes — customer-facing discount codes at checkout

CREATE TABLE IF NOT EXISTS tenant_template.coupons (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT NOT NULL,
  type              TEXT NOT NULL CHECK (type IN ('percentage', 'fixed', 'free_shipping')),
  value             NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_order_cents   INT DEFAULT 0,
  max_uses          INT,
  uses_count        INT NOT NULL DEFAULT 0,
  per_customer_limit INT DEFAULT NULL,
  applies_to        TEXT NOT NULL DEFAULT 'all' CHECK (applies_to IN ('all', 'categories', 'products')),
  product_ids       JSONB NOT NULL DEFAULT '[]',
  category_names    JSONB NOT NULL DEFAULT '[]',
  starts_at         TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS tenant_template.coupon_uses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id   UUID NOT NULL REFERENCES tenant_template.coupons(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES tenant_template.customers(id) ON DELETE SET NULL,
  order_id    UUID REFERENCES tenant_template.orders(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupon_uses_coupon
  ON tenant_template.coupon_uses (coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_uses_customer
  ON tenant_template.coupon_uses (customer_id);
