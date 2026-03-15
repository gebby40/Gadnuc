-- 032: Blog Posts

CREATE TABLE IF NOT EXISTS tenant_template.blog_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL DEFAULT '',
  excerpt         TEXT,
  featured_image  TEXT,
  author_id       UUID,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at    TIMESTAMPTZ,
  tags            JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_status
  ON tenant_template.blog_posts (status, published_at DESC);
