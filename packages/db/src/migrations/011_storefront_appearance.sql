-- Migration 011: Storefront appearance columns
-- Adds store_name, hero_enabled, and nav/footer color overrides
-- to storefront_settings for the theme editor feature.

-- ── 1. Patch the template schema ─────────────────────────────────────────────
ALTER TABLE tenant_template.storefront_settings
  ADD COLUMN IF NOT EXISTS store_name        TEXT,
  ADD COLUMN IF NOT EXISTS hero_enabled      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS nav_bg_color      CHAR(7),
  ADD COLUMN IF NOT EXISTS nav_text_color    CHAR(7),
  ADD COLUMN IF NOT EXISTS footer_bg_color   CHAR(7),
  ADD COLUMN IF NOT EXISTS footer_text_color CHAR(7);

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
         ADD COLUMN IF NOT EXISTS store_name        TEXT,
         ADD COLUMN IF NOT EXISTS hero_enabled      BOOLEAN NOT NULL DEFAULT true,
         ADD COLUMN IF NOT EXISTS nav_bg_color      CHAR(7),
         ADD COLUMN IF NOT EXISTS nav_text_color    CHAR(7),
         ADD COLUMN IF NOT EXISTS footer_bg_color   CHAR(7),
         ADD COLUMN IF NOT EXISTS footer_text_color CHAR(7)',
      rec.schema_name
    );
  END LOOP;
END;
$$;
