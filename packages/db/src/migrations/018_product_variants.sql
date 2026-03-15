-- ============================================================
-- Migration 018: Product Attributes & Variants
-- Adds variable product support (size, color, etc.)
-- ============================================================

-- ── Product Attributes (reusable attribute definitions) ─────
CREATE TABLE IF NOT EXISTS tenant_template.product_attributes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,                          -- e.g. "Color", "Size"
  slug       TEXT NOT NULL,                          -- e.g. "color", "size"
  type       TEXT NOT NULL DEFAULT 'select'
               CHECK (type IN ('select', 'color', 'size')),
  values     JSONB NOT NULL DEFAULT '[]',            -- ["Red","Blue","Green"] or ["S","M","L","XL"]
  position   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slug)
);

-- ── Product Variants (per-product SKU/price/stock combos) ───
CREATE TABLE IF NOT EXISTS tenant_template.product_variants (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       UUID NOT NULL REFERENCES tenant_template.products(id) ON DELETE CASCADE,
  sku              TEXT,                              -- variant-specific SKU (optional)
  price_cents      INT,                               -- NULL = use parent price
  sale_price_cents INT,
  stock            INT NOT NULL DEFAULT 0,
  weight_oz        NUMERIC(10,2),
  length_in        NUMERIC(10,2),
  width_in         NUMERIC(10,2),
  height_in        NUMERIC(10,2),
  attributes       JSONB NOT NULL DEFAULT '{}',       -- {"color":"Red","size":"L"}
  image_url        TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  position         INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product
  ON tenant_template.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_sku
  ON tenant_template.product_variants(sku) WHERE sku IS NOT NULL;

-- Add product_type to products table to distinguish simple vs variable
ALTER TABLE tenant_template.products
  ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'simple'
    CHECK (product_type IN ('simple', 'variable'));
