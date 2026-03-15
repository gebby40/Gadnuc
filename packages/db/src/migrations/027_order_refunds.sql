-- 027: Order Refunds — partial and full refund tracking

CREATE TABLE IF NOT EXISTS tenant_template.order_refunds (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES tenant_template.orders(id) ON DELETE CASCADE,
  amount_cents     INT NOT NULL,
  reason           TEXT,
  line_items       JSONB NOT NULL DEFAULT '[]',
  stripe_refund_id TEXT,
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_refunds_order
  ON tenant_template.order_refunds (order_id);

-- Track total refunded amount on the order
ALTER TABLE tenant_template.orders
  ADD COLUMN IF NOT EXISTS refunded_cents INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
