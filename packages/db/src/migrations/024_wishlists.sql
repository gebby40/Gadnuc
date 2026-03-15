-- 024: Wishlists — save products for later

CREATE TABLE IF NOT EXISTS tenant_template.wishlists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES tenant_template.customers(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES tenant_template.products(id) ON DELETE CASCADE,
  variant_id  UUID REFERENCES tenant_template.product_variants(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, product_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_wishlists_customer
  ON tenant_template.wishlists (customer_id, created_at DESC);
