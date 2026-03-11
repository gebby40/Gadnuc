-- Migration 005: Storefront analytics, media uploads, and Stripe session column
-- Applied to the tenant template schema AND all existing tenant schemas

-- ─── Add stripe_session_id to orders (template) ──────────────────────────────
ALTER TABLE tenant_template.orders
  ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;

-- ─── Storefront analytics (template) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_template.storefront_analytics (
  id          BIGSERIAL   PRIMARY KEY,
  event_type  TEXT        NOT NULL,          -- 'page_view' | 'product_view' | 'add_to_cart' | 'checkout_start' | 'order_complete'
  page_path   TEXT,                           -- e.g. '/products/some-uuid'
  product_id  UUID        REFERENCES tenant_template.products(id) ON DELETE SET NULL,
  session_id  TEXT,                           -- anonymous client session ID
  user_agent  TEXT,
  ip_hash     TEXT,                           -- SHA-256 of IP for privacy-safe uniqueness
  referrer    TEXT,
  metadata    JSONB       DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_event_type  ON tenant_template.storefront_analytics(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_product_id  ON tenant_template.storefront_analytics(product_id);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at  ON tenant_template.storefront_analytics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_session_id  ON tenant_template.storefront_analytics(session_id);

-- ─── Media uploads (template) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_template.media_uploads (
  id          SERIAL      PRIMARY KEY,
  key         TEXT        NOT NULL UNIQUE,   -- DO Spaces object key
  url         TEXT        NOT NULL,          -- public CDN URL
  filename    TEXT        NOT NULL,
  mime_type   TEXT,
  size_bytes  INTEGER,
  uploaded_by UUID        REFERENCES tenant_template.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Patch existing tenant schemas ───────────────────────────────────────────
DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN
    SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%'
  LOOP
    -- Add stripe_session_id to orders
    EXECUTE format(
      'ALTER TABLE %I.orders ADD COLUMN IF NOT EXISTS stripe_session_id TEXT', s
    );

    -- Storefront analytics table
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.storefront_analytics (
        id          BIGSERIAL   PRIMARY KEY,
        event_type  TEXT        NOT NULL,
        page_path   TEXT,
        product_id  UUID        REFERENCES %I.products(id) ON DELETE SET NULL,
        session_id  TEXT,
        user_agent  TEXT,
        ip_hash     TEXT,
        referrer    TEXT,
        metadata    JSONB       DEFAULT %L,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )', s, s, '{}');

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I.storefront_analytics(event_type)',
      s || '_anal_evt', s
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I.storefront_analytics(created_at DESC)',
      s || '_anal_ts', s
    );

    -- Media uploads table
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.media_uploads (
        id          SERIAL      PRIMARY KEY,
        key         TEXT        NOT NULL UNIQUE,
        url         TEXT        NOT NULL,
        filename    TEXT        NOT NULL,
        mime_type   TEXT,
        size_bytes  INTEGER,
        uploaded_by UUID        REFERENCES %I.users(id) ON DELETE SET NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )', s, s);
  END LOOP;
END
$$;
