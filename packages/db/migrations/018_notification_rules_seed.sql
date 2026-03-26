-- 通知ルール初期データ
INSERT OR IGNORE INTO notification_rules (id, name, event_type, channels, conditions, is_active) VALUES
('nr-friend-add', '新規友だち追加', 'friend_add', '["email"]', '{}', 1),
('nr-payment', '有料会員入会', 'payment_success', '["email"]', '{}', 1),
('nr-churn', '会員解約', 'payment_canceled', '["email"]', '{}', 1),
('nr-challenge', 'チャレンジ完走', 'challenge_completed', '["email"]', '{}', 1),
('nr-payment-fail', '決済失敗', 'payment_failed', '["email"]', '{}', 1),
('nr-unmatched', '手動対応メッセージ', 'unmatched_message', '["email"]', '{}', 1),
('nr-daily', '日次サマリー', 'daily_summary', '["email"]', '{}', 1);
