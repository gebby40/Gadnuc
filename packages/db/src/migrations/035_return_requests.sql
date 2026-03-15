-- 035: Return Requests / RMA

CREATE TABLE IF NOT EXISTS tenant_template.return_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES tenant_template.orders(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES tenant_template.customers(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'requested'
              CHECK (status IN ('requested', 'approved', 'received', 'refunded', 'rejected')),
  reason      TEXT NOT NULL,
  items       JSONB NOT NULL DEFAULT '[]',
  admin_notes TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_return_requests_order
  ON tenant_template.return_requests (order_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_customer
  ON tenant_template.return_requests (customer_id);
