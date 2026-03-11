-- Migration 004: Phase 2 additions — Database Isolation & Lifecycle
-- Adds provisioning_state tracking to tenants and a GDPR deletion-request log.

-- ── 1. Tenant provisioning state ─────────────────────────────────────────────
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS provisioning_state TEXT NOT NULL DEFAULT 'ready'
    CHECK (provisioning_state IN ('provisioning','ready','failed'));

-- ── 2. GDPR deletion-request log ─────────────────────────────────────────────
-- Keeps a permanent audit trail of erasure requests even after tenant data is gone.
CREATE TABLE IF NOT EXISTS public.deletion_requests (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID,                          -- NULL after tenant row is deleted
  tenant_slug   TEXT        NOT NULL,
  requested_by  TEXT        NOT NULL,          -- user ID / 'system'
  reason        TEXT,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. Replication-lag helper view ───────────────────────────────────────────
-- Only meaningful on a replica; on the primary it returns NULL lag.
CREATE OR REPLACE VIEW public.replication_lag AS
  SELECT
    CASE
      WHEN pg_is_in_recovery()
        THEN EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))
      ELSE NULL
    END AS lag_seconds;

-- ── 4. Schema health view ─────────────────────────────────────────────────────
-- Quick per-schema row-count aggregation (used by /admin/db/health).
-- The actual per-table data comes from pg_stat_user_tables at query time.
CREATE OR REPLACE VIEW public.tenant_schema_stats AS
  SELECT
    t.id            AS tenant_id,
    t.slug,
    t.status,
    t.provisioning_state,
    t.created_at
  FROM public.tenants t
  ORDER BY t.created_at;
