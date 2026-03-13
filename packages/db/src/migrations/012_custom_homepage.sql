-- Migration 012: Custom homepage support
-- Allows tenants to upload a custom HTML page to replace the auto-generated storefront.
-- Adds custom_homepage_enabled and custom_homepage_url to storefront_settings.

-- ── 1. Patch the template schema ─────────────────────────────────────────────
ALTER TABLE tenant_template.storefront_settings
  ADD COLUMN IF NOT EXISTS custom_homepage_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_homepage_url     TEXT;

-- ── 2. Patch every existing tenant schema ────────────────────────────────────
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
      'ALTER TABLE %I.storefront_settings
         ADD COLUMN IF NOT EXISTS custom_homepage_enabled BOOLEAN NOT NULL DEFAULT false,
         ADD COLUMN IF NOT EXISTS custom_homepage_url     TEXT',
      rec.schema_name
    );
  END LOOP;
END;
$$;
