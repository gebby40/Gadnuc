-- 019: Product Images — multi-image gallery per product/variant
-- Replaces single image_url column with a full image gallery table.

CREATE TABLE IF NOT EXISTS tenant_template.product_images (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES tenant_template.products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES tenant_template.product_variants(id) ON DELETE SET NULL,
  url        TEXT NOT NULL,
  cdn_key    TEXT,
  alt_text   TEXT DEFAULT '',
  position   INT NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product
  ON tenant_template.product_images (product_id, position);
