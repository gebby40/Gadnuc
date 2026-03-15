-- 039: Product URL Slugs — SEO-friendly URLs

ALTER TABLE tenant_template.products
  ADD COLUMN IF NOT EXISTS slug TEXT;

-- Create unique index (per-tenant, since each tenant has its own schema)
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_slug
  ON tenant_template.products (slug) WHERE slug IS NOT NULL;
