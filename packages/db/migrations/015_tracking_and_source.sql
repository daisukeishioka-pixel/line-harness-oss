-- 流入経路トラッキング

CREATE TABLE IF NOT EXISTS tracking_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tracking_id TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  ip_address TEXT DEFAULT NULL,
  user_agent TEXT DEFAULT NULL,
  clicked_at TEXT DEFAULT (datetime('now')),
  matched_line_user_id TEXT DEFAULT NULL,
  matched_at TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_tracking_clicks_source ON tracking_clicks(source);
CREATE INDEX IF NOT EXISTS idx_tracking_clicks_tracking_id ON tracking_clicks(tracking_id);
