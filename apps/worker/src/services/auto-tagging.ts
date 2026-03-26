import { jstNow } from '@line-crm/db';

/**
 * タグをfriendに付与（重複チェック付き）
 * tagIdはタグのID（例: 'tag-challenge-completed'）
 */
export async function autoAddTag(
  db: D1Database,
  friendId: string,
  tagId: string,
): Promise<void> {
  await db
    .prepare('INSERT OR IGNORE INTO friend_tags (friend_id, tag_id, assigned_at) VALUES (?, ?, ?)')
    .bind(friendId, tagId, jstNow())
    .run();
}

/**
 * タグをfriendから削除
 */
export async function autoRemoveTag(
  db: D1Database,
  friendId: string,
  tagId: string,
): Promise<void> {
  await db
    .prepare('DELETE FROM friend_tags WHERE friend_id = ? AND tag_id = ?')
    .bind(friendId, tagId)
    .run();
}

/**
 * line_user_id から friend の id を取得
 */
export async function getFriendIdByLineUserId(
  db: D1Database,
  lineUserId: string,
): Promise<string | null> {
  const row = await db
    .prepare('SELECT id FROM friends WHERE line_user_id = ?')
    .bind(lineUserId)
    .first<{ id: string }>();
  return row?.id ?? null;
}

/**
 * 流入経路に対応するタグIDを返す
 */
export function getSourceTagId(source: string): string {
  const map: Record<string, string> = {
    lp: 'tag-src-lp',
    instagram: 'tag-src-instagram',
    'meta-ads': 'tag-src-meta-ads',
    referral: 'tag-src-referral',
    google: 'tag-src-google',
    direct: 'tag-src-direct',
  };
  return map[source] || 'tag-src-direct';
}
