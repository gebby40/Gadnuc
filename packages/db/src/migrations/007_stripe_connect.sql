-- ============================================================
-- Migration 007: Stripe Connect support
-- Adds Stripe Connect columns to tenants and a CSRF state table
-- ============================================================

-- Stripe Connect columns on tenants
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_connect_enabled     BOOLEAN NOT NULL DEFAULT false;

-- CSRF state tokens for Stripe Connect OAuth (10-minute TTL)
CREATE TABLE IF NOT EXISTS public.stripe_connect_states (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  state      TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sc_states_state   ON public.stripe_connect_states(state);
CREATE INDEX IF NOT EXISTS idx_sc_states_expires ON public.stripe_connect_states(expires_at);
