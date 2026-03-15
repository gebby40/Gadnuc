-- 030: Static Pages / CMS

CREATE TABLE IF NOT EXISTS tenant_template.pages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL DEFAULT '',
  seo_title       TEXT,
  seo_description TEXT,
  is_published    BOOLEAN NOT NULL DEFAULT false,
  position        INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slug)
);
