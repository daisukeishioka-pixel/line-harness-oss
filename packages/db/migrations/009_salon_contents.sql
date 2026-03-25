-- Migration 009: Salon contents and schedules tables
-- For 整体卒業サロン LIFF mypage

-- ============================================================
-- Salon Contents (videos, articles, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS contents (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  category       TEXT NOT NULL CHECK (category IN ('neck_shoulder', 'back_chest', 'pelvis_waist', 'morning_routine', 'archive')),
  description    TEXT,
  video_url      TEXT,
  thumbnail_url  TEXT,
  duration       INTEGER,  -- seconds
  is_published   INTEGER NOT NULL DEFAULT 1,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_contents_category ON contents (category);
CREATE INDEX IF NOT EXISTS idx_contents_published ON contents (is_published);

-- ============================================================
-- Live Schedules
-- ============================================================
CREATE TABLE IF NOT EXISTS schedules (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  description    TEXT,
  scheduled_at   TEXT NOT NULL,
  live_url       TEXT,
  archive_url    TEXT,
  is_published   INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_schedules_scheduled_at ON schedules (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_schedules_published ON schedules (is_published);
