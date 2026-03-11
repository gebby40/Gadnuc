-- ============================================================
-- Migration 002: Tenant template schema
-- All new tenant schemas are cloned from tenant_template.
-- Add columns here → they appear in every new tenant automatically.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS tenant_template;

-- Users (per-tenant user accounts, separate from auth provider IDs)
CREATE TABLE IF NOT EXISTS tenant_template.users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id  TEXT NOT NULL UNIQUE,        -- ID from auth provider (JWT sub)
  username      TEXT NOT NULL UNIQUE CHECK (length(username) BETWEEN 3 AND 50),
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT,
  role          TEXT NOT NULL DEFAULT 'operator'
                  CHECK (role IN ('tenant_admin','operator','viewer')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  mfa_enabled   BOOLEAN NOT NULL DEFAULT false,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Products / inventory items
CREATE TABLE IF NOT EXISTS tenant_template.products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku           TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT,
  category      TEXT,
  price_cents   INT  NOT NULL DEFAULT 0,
  stock_qty     INT  NOT NULL DEFAULT 0,
  low_stock_threshold INT NOT NULL DEFAULT 10,
  image_url     TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_sku      ON tenant_template.products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON tenant_template.products(category);
CREATE INDEX IF NOT EXISTS idx_products_active   ON tenant_template.products(is_active);

-- Filaments (3D printing specific inventory)
CREATE TABLE IF NOT EXISTS tenant_template.filaments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  brand         TEXT,
  material      TEXT NOT NULL,             -- PLA, ABS, PETG, TPU, etc.
  color         TEXT,
  color_hex     CHAR(7),                   -- #RRGGBB
  diameter_mm   NUMERIC(4,2) NOT NULL DEFAULT 1.75,
  weight_g      INT  NOT NULL DEFAULT 1000,
  remaining_pct SMALLINT NOT NULL DEFAULT 100 CHECK (remaining_pct BETWEEN 0 AND 100),
  price_cents   INT  NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Orders
CREATE TABLE IF NOT EXISTS tenant_template.orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number  TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','shipped','delivered','cancelled','refunded')),
  total_cents   INT  NOT NULL DEFAULT 0,
  stripe_payment_intent_id TEXT,
  shipping_address JSONB,
  notes         TEXT,
  created_by    UUID REFERENCES tenant_template.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_status  ON tenant_template.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON tenant_template.orders(created_at DESC);

-- Order line items
CREATE TABLE IF NOT EXISTS tenant_template.order_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES tenant_template.orders(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES tenant_template.products(id),
  sku         TEXT NOT NULL,
  name        TEXT NOT NULL,
  quantity    INT  NOT NULL CHECK (quantity > 0),
  unit_price_cents INT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON tenant_template.order_items(order_id);

-- Storefront / homepage settings
CREATE TABLE IF NOT EXISTS tenant_template.storefront_settings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme         TEXT NOT NULL DEFAULT 'default',
  logo_url      TEXT,
  hero_title    TEXT NOT NULL DEFAULT 'Welcome',
  hero_subtitle TEXT,
  hero_image_url TEXT,
  primary_color CHAR(7) DEFAULT '#0070f3',
  accent_color  CHAR(7) DEFAULT '#ff4f4f',
  contact_email TEXT,
  contact_phone TEXT,
  social_links  JSONB NOT NULL DEFAULT '{}',
  seo_title     TEXT,
  seo_description TEXT,
  custom_css    TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
