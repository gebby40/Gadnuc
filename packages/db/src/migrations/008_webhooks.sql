-- ============================================================
-- Migration 008: Webhook system
-- Per-tenant webhook endpoints with delivery tracking
-- ============================================================

-- Webhook registrations (per tenant)
CREATE TABLE IF NOT EXISTS public.webhooks (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  url                   TEXT        NOT NULL CHECK (length(url) <= 2048),
  events                JSONB       NOT NULL DEFAULT '["*"]',   -- array of event type strings
  signing_secret        TEXT        NOT NULL,                    -- HMAC-SHA256 key
  name                  TEXT,                                    -- human-readable label
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  consecutive_failures  INT         NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_tenant    ON public.webhooks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_active    ON public.webhooks(tenant_id, is_active) WHERE is_active = true;

-- Webhook delivery log (append-only)
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id              BIGSERIAL   PRIMARY KEY,
  webhook_id      UUID        NOT NULL REFERENCES public.webhooks(id) ON DELETE CASCADE,
  event_type      TEXT        NOT NULL,
  payload         JSONB       NOT NULL,
  response_status INT,
  success         BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_hook
  ON public.webhook_deliveries(webhook_id, created_at DESC);

-- Prune old delivery logs automatically (keep 30 days)
-- Run via pg_cron or a scheduled job:
--   DELETE FROM public.webhook_deliveries WHERE created_at < now() - interval '30 days';
