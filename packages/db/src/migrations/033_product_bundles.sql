-- 033: Product Bundles — group products together at a discount

CREATE TABLE IF NOT EXISTS tenant_template.product_bundles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID NOT NULL REFERENCES tenant_template.products(id) ON DELETE CASCADE,
  items        JSONB NOT NULL DEFAULT '[]',
  discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id)
);
-- items schema: [{product_id, variant_id?, qty, discount_pct?}]
