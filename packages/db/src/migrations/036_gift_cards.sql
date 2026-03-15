-- 036: Gift Cards

CREATE TABLE IF NOT EXISTS tenant_template.gift_cards (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 TEXT NOT NULL UNIQUE,
  balance_cents        INT NOT NULL DEFAULT 0,
  original_amount_cents INT NOT NULL DEFAULT 0,
  customer_id          UUID REFERENCES tenant_template.customers(id) ON DELETE SET NULL,
  expires_at           TIMESTAMPTZ,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_template.gift_card_transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_card_id UUID NOT NULL REFERENCES tenant_template.gift_cards(id) ON DELETE CASCADE,
  amount_cents INT NOT NULL,
  order_id     UUID REFERENCES tenant_template.orders(id) ON DELETE SET NULL,
  type         TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gift_card_transactions_card
  ON tenant_template.gift_card_transactions (gift_card_id);
