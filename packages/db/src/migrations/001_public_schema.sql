-- ============================================================
-- Migration 001: Public (shared) schema
-- Tables shared across all tenants: tenants, plans, audit_log
-- ============================================================

-- Plans / subscription tiers
CREATE TABLE IF NOT EXISTS public.plans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,           -- 'starter', 'professional', 'enterprise'
  price_cents INT  NOT NULL DEFAULT 0,        -- Monthly price in cents
  max_users   INT  NOT NULL DEFAULT 5,
  max_products INT NOT NULL DEFAULT 500,
  features    JSONB NOT NULL DEFAULT '[]',    -- Array of feature flag names
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.plans (name, price_cents, max_users, max_products, features) VALUES
  ('starter',      2900,  5,   500,  '["storefront","inventory"]'),
  ('professional', 9900,  25,  5000, '["storefront","inventory","matrix","analytics"]'),
  ('enterprise',   29900, 200, 99999,'["storefront","inventory","matrix","analytics","custom_domain","api_access"]')
ON CONFLICT (name) DO NOTHING;

-- Tenants (customers)
CREATE TABLE IF NOT EXISTS public.tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9_]{1,63}$'),
  display_name    TEXT NOT NULL,
  plan_id         UUID NOT NULL REFERENCES public.plans(id),
  stripe_customer_id    TEXT,
  stripe_subscription_id TEXT,
  status          TEXT NOT NULL DEFAULT 'trialing'
                    CHECK (status IN ('trialing','active','past_due','suspended','cancelled')),
  custom_domain   TEXT,
  trial_ends_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug   ON public.tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants(status);

-- Global feature flags (per tenant overrides)
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_name   TEXT NOT NULL,
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  rollout_pct SMALLINT NOT NULL DEFAULT 100 CHECK (rollout_pct BETWEEN 0 AND 100),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (flag_name, tenant_id)             -- NULL tenant_id = global flag
);

-- Immutable audit log — append-only, never update/delete rows here
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  actor_id    TEXT,                         -- user ID or 'system'
  actor_role  TEXT,
  event_type  TEXT NOT NULL,               -- 'auth.login', 'tenant.created', etc.
  resource    TEXT,                        -- table or entity name
  resource_id TEXT,
  metadata    JSONB,
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant   ON public.audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created  ON public.audit_log(created_at DESC);

-- Refresh tokens (global, tied to user within tenant)
CREATE TABLE IF NOT EXISTS public.refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,        -- SHA-256 hash — never store plaintext
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON public.refresh_tokens(token_hash);
