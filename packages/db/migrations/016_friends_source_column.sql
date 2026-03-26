-- friendsテーブルに流入経路カラムを追加
ALTER TABLE friends ADD COLUMN source TEXT DEFAULT NULL;
ALTER TABLE friends ADD COLUMN source_matched_at TEXT DEFAULT NULL;
