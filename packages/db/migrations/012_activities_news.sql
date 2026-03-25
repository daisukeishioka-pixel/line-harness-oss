-- Migration 012: Activity tracking & News
-- アクティビティカレンダー用テーブルとニューステーブル

-- ============================================================
-- Member Activities (エクササイズ記録・コンテンツ視聴記録)
-- ============================================================
CREATE TABLE IF NOT EXISTS member_activities (
  id             TEXT PRIMARY KEY,
  friend_id      TEXT NOT NULL REFERENCES friends (id) ON DELETE CASCADE,
  activity_type  TEXT NOT NULL CHECK (activity_type IN ('video_watch', 'exercise', 'live_attend', 'manual')),
  content_id     TEXT,
  note           TEXT,
  activity_date  TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_member_activities_friend ON member_activities (friend_id);
CREATE INDEX IF NOT EXISTS idx_member_activities_date ON member_activities (friend_id, activity_date);

-- ============================================================
-- Member Goals (日々の目標設定)
-- ============================================================
CREATE TABLE IF NOT EXISTS member_goals (
  id             TEXT PRIMARY KEY,
  friend_id      TEXT NOT NULL REFERENCES friends (id) ON DELETE CASCADE,
  goal_text      TEXT NOT NULL,
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_member_goals_friend ON member_goals (friend_id);

-- ============================================================
-- News / Announcements (ニュース・お知らせ)
-- ============================================================
CREATE TABLE IF NOT EXISTS news (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  category       TEXT NOT NULL DEFAULT 'info' CHECK (category IN ('info', 'event', 'update', 'campaign')),
  is_published   INTEGER NOT NULL DEFAULT 1,
  published_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_news_published ON news (is_published, published_at);
