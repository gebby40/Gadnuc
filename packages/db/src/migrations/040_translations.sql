-- 040: Translations — multi-language support

CREATE TABLE IF NOT EXISTS tenant_template.translations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id   UUID NOT NULL,
  locale      TEXT NOT NULL,
  field       TEXT NOT NULL,
  value       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, locale, field)
);

CREATE INDEX IF NOT EXISTS idx_translations_entity
  ON tenant_template.translations (entity_type, entity_id, locale);
