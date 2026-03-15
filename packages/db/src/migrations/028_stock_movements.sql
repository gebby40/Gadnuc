-- 028: Stock Movements — audit trail for inventory changes

CREATE TABLE IF NOT EXISTS tenant_template.stock_movements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID NOT NULL REFERENCES tenant_template.products(id) ON DELETE CASCADE,
  variant_id   UUID REFERENCES tenant_template.product_variants(id) ON DELETE SET NULL,
  qty_change   INT NOT NULL,
  reason       TEXT NOT NULL CHECK (reason IN ('sale', 'return', 'adjustment', 'transfer', 'restock')),
  reference_id TEXT,
  notes        TEXT,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product
  ON tenant_template.stock_movements (product_id, created_at DESC);
