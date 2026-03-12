-- ============================================================
-- Migration 009: API key authentication
-- Per-tenant API keys for programmatic access
-- ============================================================

CREATE TABLE IF NOT EXISTS public.api_keys (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key_hash      TEXT        NOT NULL UNIQUE,       -- SHA-256 hash of the raw key
  key_prefix    TEXT        NOT NULL,              -- First 8 chars for identification (e.g. "gad_a1b2")
  name          TEXT        NOT NULL,              -- Human-readable label
  role          TEXT        NOT NULL DEFAULT 'viewer'
                  CHECK (role IN ('operator', 'viewer')),
  scopes        JSONB       NOT NULL DEFAULT '[]', -- Optional fine-grained scope array
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  expires_at    TIMESTAMPTZ,                       -- NULL = never expires
  last_used_at  TIMESTAMPTZ,
  created_by    TEXT,                              -- User ID who created the key
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant  ON public.api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash    ON public.api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active  ON public.api_keys(tenant_id, is_active) WHERE is_active = true;
