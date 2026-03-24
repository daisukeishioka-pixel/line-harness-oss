-- ============================================================
-- サブスクリプション管理カラム追加
-- ============================================================

ALTER TABLE friends ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE friends ADD COLUMN subscription_id TEXT;
ALTER TABLE friends ADD COLUMN subscription_status TEXT DEFAULT NULL;
ALTER TABLE friends ADD COLUMN current_period_end TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_friends_stripe_customer ON friends (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_friends_subscription_status ON friends (subscription_status);
