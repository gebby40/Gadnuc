-- 010_platform_admins.sql
-- Platform-level admin accounts (super_admin users who manage the whole platform)

CREATE TABLE IF NOT EXISTS public.platform_admins (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL,
  display_name   TEXT NOT NULL DEFAULT '',
  totp_secret    TEXT,          -- AES-256-GCM encrypted, NULL = MFA disabled
  is_active      BOOLEAN NOT NULL DEFAULT true,
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_admins_email ON public.platform_admins (email);
