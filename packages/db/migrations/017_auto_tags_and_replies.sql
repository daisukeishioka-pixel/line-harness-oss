-- 自動付与タグの初期登録
INSERT OR IGNORE INTO tags (id, name, color) VALUES
('tag-challenge-completed', 'チャレンジ完走', '#4caf50'),
('tag-paid-member', '有料会員', '#1a6b5a'),
('tag-churned', '解約済み', '#e53935'),
('tag-challenge-stopped', '配信停止', '#ff9800'),
('tag-src-lp', '流入:LP', '#2196f3'),
('tag-src-instagram', '流入:Instagram', '#e91e63'),
('tag-src-meta-ads', '流入:Meta広告', '#9c27b0'),
('tag-src-referral', '流入:紹介', '#00bcd4'),
('tag-src-google', '流入:Google', '#607d8b'),
('tag-src-direct', '流入:直接', '#795548');

-- 自動応答の初期データ
INSERT OR IGNORE INTO auto_replies (id, keyword, match_type, response_type, response_content) VALUES
('ar-price', '料金', 'contains', 'text', '整体卒業サロンの料金についてお問い合わせありがとうございます！

月額2,980円（税込）で、以下がすべて含まれます✨

✅ セルフケア動画が見放題
✅ 週1回のLive配信（アーカイブあり）
✅ メンバー限定コミュニティ
✅ チャットでの質問サポート

入会金は不要、いつでも解約OKです。

🎉 今なら初月無料キャンペーン中！

▶ 詳しくはこちら
https://seitai-graduation-salon.vercel.app'),

('ar-cancel', '解約', 'contains', 'text', '解約についてのお問い合わせですね。

整体卒業サロンはいつでも解約可能です。
違約金や解約手数料は一切ありません。

マイページから簡単に手続きできます。
解約後も、当月末まではご利用いただけます。

ご不明点があればお気軽にメッセージください😊'),

('ar-payment', '支払い', 'contains', 'text', 'お支払い方法についてですね。

以下の方法に対応しています💳
・クレジットカード（Visa / Mastercard / JCB / AMEX）
・口座振替

お支払いはStripeを通じて安全に処理されます。

ご不明点があればお気軽にどうぞ！'),

('ar-live', 'Live', 'contains', 'text', 'Live配信についてのお問い合わせですね！

📅 毎週1回（週1回、月4回）
⏰ 時間は事前にLINEでお知らせします
📱 スマホだけで視聴OK

Live配信では、トレーナーがリアルタイムで
セルフケアの指導を行います。
フォームの確認や個別の質問もできますよ！

すべてのLive配信はアーカイブとして保存されるので、
リアルタイムで参加できなくても大丈夫です😊'),

('ar-trial', '無料', 'contains', 'text', '🎉 今なら初月無料キャンペーン中です！

月額2,980円 → 初月 ¥0
いつでも解約OK・入会金なし

まずは7日間の整体卒業チャレンジから
始めてみませんか？

▶ 詳しくはこちら
https://seitai-graduation-salon.vercel.app'),

('ar-challenge', 'チャレンジ', 'contains', 'text', '7日間 整体卒業チャレンジに興味がありますか？✨

友だち追加するだけで、毎晩20時に
セルフケア動画が届きます。

1日5分の動画を見ながら一緒にやるだけ！
7日間で体の変化を実感できますよ💪

すでに参加中の方は、毎日20時のメッセージをお待ちください😊');
