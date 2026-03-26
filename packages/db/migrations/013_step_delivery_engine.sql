-- ステップ配信エンジン: 7日間チャレンジ用テーブル

--- step_messages テーブル ---
CREATE TABLE IF NOT EXISTS step_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sequence_name TEXT NOT NULL DEFAULT '7day_challenge',
  step_number INTEGER NOT NULL,
  delay_hours INTEGER NOT NULL DEFAULT 0,
  message_type TEXT NOT NULL DEFAULT 'text',
  content TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  condition_check TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

--- user_sequences テーブル ---
CREATE TABLE IF NOT EXISTS user_sequences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id TEXT NOT NULL,
  sequence_name TEXT NOT NULL DEFAULT '7day_challenge',
  current_step INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TEXT DEFAULT (datetime('now')),
  last_sent_at TEXT DEFAULT NULL,
  completed_at TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_user_sequences_status ON user_sequences(status);
CREATE INDEX IF NOT EXISTS idx_user_sequences_line_user ON user_sequences(line_user_id);

--- delivery_logs テーブル ---
CREATE TABLE IF NOT EXISTS delivery_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id TEXT NOT NULL,
  sequence_name TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT DEFAULT NULL,
  sent_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_delivery_logs_user ON delivery_logs(line_user_id);
