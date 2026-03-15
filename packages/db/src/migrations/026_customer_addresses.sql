-- 026: Customer Addresses — saved address book for checkout

CREATE TABLE IF NOT EXISTS tenant_template.customer_addresses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID NOT NULL REFERENCES tenant_template.customers(id) ON DELETE CASCADE,
  label        TEXT NOT NULL DEFAULT 'Home',
  is_default   BOOLEAN NOT NULL DEFAULT false,
  first_name   TEXT NOT NULL DEFAULT '',
  last_name    TEXT NOT NULL DEFAULT '',
  line1        TEXT NOT NULL,
  line2        TEXT,
  city         TEXT NOT NULL,
  state        TEXT,
  postal       TEXT NOT NULL,
  country      TEXT NOT NULL DEFAULT 'US',
  phone        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer
  ON tenant_template.customer_addresses (customer_id);
