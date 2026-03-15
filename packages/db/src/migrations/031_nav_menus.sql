-- 031: Navigation Menus — configurable header/footer menus

CREATE TABLE IF NOT EXISTS tenant_template.nav_menus (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location  TEXT NOT NULL CHECK (location IN ('header', 'footer')) UNIQUE,
  items     JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default menus
INSERT INTO tenant_template.nav_menus (location, items) VALUES
  ('header', '[]'),
  ('footer', '[]')
ON CONFLICT (location) DO NOTHING;
