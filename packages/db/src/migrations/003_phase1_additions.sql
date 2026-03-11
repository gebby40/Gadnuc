-- Migration 003: Phase 1 additions
-- Adds password_hash + totp_secret to the tenant template schema,
-- and patches every already-provisioned tenant schema.

-- ── 1. Patch the template schema ─────────────────────────────────────────────
ALTER TABLE tenant_template.users
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS totp_secret   TEXT;   -- AES-256-GCM encrypted

-- ── 2. Patch every existing tenant schema ────────────────────────────────────
-- We iterate over all schemas that look like tenant_<slug> and apply the same
-- ALTER TABLE so live tenants are consistent with the template.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT schema_name
    FROM   information_schema.schemata
    WHERE  schema_name LIKE 'tenant\_%' ESCAPE '\'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.users
         ADD COLUMN IF NOT EXISTS password_hash TEXT,
         ADD COLUMN IF NOT EXISTS totp_secret   TEXT',
      rec.schema_name
    );
  END LOOP;
END;
$$;
