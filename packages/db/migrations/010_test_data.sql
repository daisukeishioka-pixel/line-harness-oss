-- テスト用データ: マイページ動作確認用
-- friend, contents, schedules, tags

-- テスト用友だち（アクティブ会員）
INSERT OR IGNORE INTO friends (id, line_user_id, display_name, picture_url, is_following, subscription_status, current_period_end, created_at, updated_at)
VALUES (
  'test-friend-001',
  'U_test_user_001',
  'テスト太郎',
  NULL,
  1,
  'active',
  strftime('%Y-%m-%dT%H:%M:%f', 'now', '+30 days', '+9 hours'),
  strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'),
  strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
);

-- salon_member タグ
INSERT OR IGNORE INTO tags (id, name, color) VALUES ('tag-salon-member', 'salon_member', '#1a6b5a');
INSERT OR IGNORE INTO friend_tags (friend_id, tag_id, assigned_at) VALUES ('test-friend-001', 'tag-salon-member', strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'));

-- コンテンツデータ
INSERT OR IGNORE INTO contents (id, title, category, description, video_url, thumbnail_url, duration, is_published, sort_order)
VALUES
  ('cnt-001', '首・肩スッキリストレッチ 10分', 'neck_shoulder', '肩こり解消に効果的な基本ストレッチです', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', NULL, 600, 1, 1),
  ('cnt-002', '肩甲骨はがしエクササイズ', 'neck_shoulder', 'デスクワーカー必見の肩甲骨ほぐし', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', NULL, 480, 1, 2),
  ('cnt-003', '背中の緊張をほぐす呼吸法', 'back_chest', '深呼吸と連動した背中のリラックス法', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', NULL, 360, 1, 1),
  ('cnt-004', '猫背改善エクササイズ', 'back_chest', '姿勢改善に役立つトレーニング', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', NULL, 720, 1, 2),
  ('cnt-005', '骨盤矯正ストレッチ 基本編', 'pelvis_waist', '骨盤の歪みを整える基本メニュー', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', NULL, 540, 1, 1),
  ('cnt-006', '腰痛予防エクササイズ', 'pelvis_waist', '腰痛を防ぐための日常ケア', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', NULL, 420, 1, 2),
  ('cnt-007', '朝5分モーニングルーティン', 'morning_routine', '毎朝のルーティンで体を目覚めさせましょう', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', NULL, 300, 1, 1),
  ('cnt-008', '第10回 Liveアーカイブ: 質疑応答', 'archive', '会員限定のLive配信アーカイブです', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', NULL, 3600, 1, 1);

-- スケジュールデータ（今後のLive配信）
INSERT OR IGNORE INTO schedules (id, title, description, scheduled_at, live_url, is_published)
VALUES
  ('sch-001', '第11回 Live配信: 肩こり特集', '肩こりの原因と対策を解説します', strftime('%Y-%m-%dT19:00:00', 'now', '+7 days'), 'https://www.youtube.com/live/example', 1),
  ('sch-002', '第12回 Live配信: 腰痛ケア特集', '腰痛に悩む方向けの特別セッション', strftime('%Y-%m-%dT19:00:00', 'now', '+14 days'), NULL, 1),
  ('sch-003', '第13回 Live配信: Q&Aセッション', '会員の質問にお答えします', strftime('%Y-%m-%dT19:00:00', 'now', '+21 days'), NULL, 1);
