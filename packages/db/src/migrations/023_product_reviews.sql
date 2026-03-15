-- 023: Product Reviews & Ratings

CREATE TABLE IF NOT EXISTS tenant_template.product_reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES tenant_template.products(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES tenant_template.customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL DEFAULT 'Anonymous',
  rating      INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title       TEXT,
  body        TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_reviews_product
  ON tenant_template.product_reviews (product_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_reviews_customer
  ON tenant_template.product_reviews (customer_id);

-- Aggregate cache columns on products for fast display
ALTER TABLE tenant_template.products
  ADD COLUMN IF NOT EXISTS review_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_rating NUMERIC(3,2) NOT NULL DEFAULT 0;
