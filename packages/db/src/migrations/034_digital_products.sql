-- 034: Digital / Downloadable Products

CREATE TABLE IF NOT EXISTS tenant_template.product_downloads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES tenant_template.products(id) ON DELETE CASCADE,
  file_key        TEXT NOT NULL,
  file_name       TEXT NOT NULL,
  file_size_bytes BIGINT,
  download_limit  INT,
  expiry_days     INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_downloads_product
  ON tenant_template.product_downloads (product_id);

CREATE TABLE IF NOT EXISTS tenant_template.download_permissions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         UUID NOT NULL REFERENCES tenant_template.customers(id) ON DELETE CASCADE,
  product_download_id UUID NOT NULL REFERENCES tenant_template.product_downloads(id) ON DELETE CASCADE,
  order_id            UUID REFERENCES tenant_template.orders(id) ON DELETE SET NULL,
  downloads_remaining INT,
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_download_permissions_customer
  ON tenant_template.download_permissions (customer_id);

-- Add product_type value for digital products
-- products.product_type already supports 'simple' and 'variable'; we'll use metadata flag
ALTER TABLE tenant_template.products
  ADD COLUMN IF NOT EXISTS is_digital BOOLEAN NOT NULL DEFAULT false;
