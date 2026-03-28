-- Migration 020: Blog posts for 整体卒業サロン LP
-- Categories: セルフケア, ストレッチ, お知らせ, コラム

CREATE TABLE IF NOT EXISTS blog_posts (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  excerpt       TEXT NOT NULL,
  body          TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('セルフケア', 'ストレッチ', 'お知らせ', 'コラム')),
  og_image_url  TEXT,
  is_published  INTEGER NOT NULL DEFAULT 0,
  published_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts (slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts (is_published, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts (category, is_published, published_at DESC);
