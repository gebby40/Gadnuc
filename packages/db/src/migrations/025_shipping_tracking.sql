-- 025: Shipping Tracking — add tracking fields to orders

ALTER TABLE tenant_template.orders
  ADD COLUMN IF NOT EXISTS tracking_number  TEXT,
  ADD COLUMN IF NOT EXISTS tracking_carrier  TEXT,
  ADD COLUMN IF NOT EXISTS tracking_url      TEXT;
