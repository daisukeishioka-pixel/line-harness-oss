/**
 * LINE Channel Access Token 自動更新サービス
 *
 * LINE の Channel Access Token v2.1 は発行から30日で期限切れ。
 * このサービスはCronで定期実行され、期限が7日以内のトークンを自動更新する。
 *
 * 対象: line_accounts テーブルに登録されたアカウント
 * 注意: 環境変数の LINE_CHANNEL_ACCESS_TOKEN（メインアカウント）は手動管理のまま
 */

const TOKEN_REFRESH_BUFFER_MS = 7 * 24 * 60 * 60 * 1000; // 7日前に更新

interface LineAccount {
  id: string;
  channel_id: string;
  channel_secret: string;
  channel_access_token: string;
  token_expires_at: string | null;
}

/**
 * 期限が近いトークンをチェックし、自動更新する
 */
export async function refreshExpiringTokens(db: D1Database): Promise<void> {
  try {
    // token_expires_at が設定されているアカウントで、期限が7日以内のものを取得
    const now = new Date();
    const threshold = new Date(now.getTime() + TOKEN_REFRESH_BUFFER_MS).toISOString();

    const accounts = await db
      .prepare(
        `SELECT id, channel_id, channel_secret, channel_access_token, token_expires_at
         FROM line_accounts
         WHERE is_active = 1 AND token_expires_at IS NOT NULL AND token_expires_at < ?`,
      )
      .bind(threshold)
      .all<LineAccount>();

    if (!accounts.results.length) return;

    for (const account of accounts.results) {
      try {
        await refreshToken(db, account);
        console.log(`Token refreshed for account ${account.channel_id}`);
      } catch (err) {
        console.error(`Failed to refresh token for ${account.channel_id}:`, err);
      }
    }
  } catch (err) {
    console.error('Token refresh check failed:', err);
  }
}

/**
 * 個別アカウントのトークンを更新
 * LINE Channel Access Token v2.1 API を使用
 */
async function refreshToken(db: D1Database, account: LineAccount): Promise<void> {
  // 新しいトークンを発行
  const res = await fetch('https://api.line.me/v2/oauth/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: account.channel_id,
      client_secret: account.channel_secret,
    }).toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LINE token API error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };

  // 新しい有効期限を計算（expires_in は秒数）
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  // DBを更新
  await db
    .prepare(
      `UPDATE line_accounts SET channel_access_token = ?, token_expires_at = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(data.access_token, expiresAt, new Date().toISOString(), account.id)
    .run();
}
