const NOTIFY_TO = 'kyoya.tamura0705@gmail.com';
const NOTIFY_FROM = 'onboarding@resend.dev';

interface NotifyOptions {
  subject: string;
  html: string;
}

export async function sendNotification(resendApiKey: string, options: NotifyOptions): Promise<boolean> {
  if (!resendApiKey) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: NOTIFY_FROM,
        to: [NOTIFY_TO],
        subject: `[整体卒業サロン] ${options.subject}`,
        html: options.html,
      }),
    });
    if (!res.ok) {
      console.error('Resend API error:', res.status, await res.text().catch(() => ''));
    }
    return res.ok;
  } catch (e) {
    console.error('Email notification failed:', e);
    return false;
  }
}

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function nowJST(): string {
  return new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

export async function notifyNewFriend(resendApiKey: string, displayName: string | null, source: string | null) {
  await sendNotification(resendApiKey, {
    subject: '新規友だち追加',
    html: `
      <h2>🆕 新しい友だちが追加されました</h2>
      <table style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px;color:#666;">名前</td><td style="padding:8px;font-weight:bold;">${esc(displayName) || '未取得'}</td></tr>
        <tr><td style="padding:8px;color:#666;">流入経路</td><td style="padding:8px;">${esc(source) || '直接'}</td></tr>
        <tr><td style="padding:8px;color:#666;">日時</td><td style="padding:8px;">${nowJST()}</td></tr>
      </table>
      <p style="margin-top:16px;"><a href="https://line-harness-oss-web.vercel.app/friends" style="color:#4caf50;">管理画面で確認 →</a></p>
    `,
  });
}

export async function notifyNewPayment(resendApiKey: string, displayName: string | null, amount: number) {
  await sendNotification(resendApiKey, {
    subject: '有料会員の入会',
    html: `
      <h2>💰 新しい有料会員が入会しました</h2>
      <table style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px;color:#666;">名前</td><td style="padding:8px;font-weight:bold;">${esc(displayName) || '未取得'}</td></tr>
        <tr><td style="padding:8px;color:#666;">金額</td><td style="padding:8px;">¥${amount.toLocaleString()}/月</td></tr>
        <tr><td style="padding:8px;color:#666;">日時</td><td style="padding:8px;">${nowJST()}</td></tr>
      </table>
      <p style="margin-top:16px;"><a href="https://line-harness-oss-web.vercel.app/payments" style="color:#4caf50;">管理画面で確認 →</a></p>
    `,
  });
}

export async function notifyChurn(resendApiKey: string, displayName: string | null) {
  await sendNotification(resendApiKey, {
    subject: '⚠️ 会員が解約しました',
    html: `
      <h2>⚠️ 有料会員が解約しました</h2>
      <table style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px;color:#666;">名前</td><td style="padding:8px;font-weight:bold;">${esc(displayName) || '未取得'}</td></tr>
        <tr><td style="padding:8px;color:#666;">日時</td><td style="padding:8px;">${nowJST()}</td></tr>
      </table>
      <p style="margin-top:16px;"><a href="https://line-harness-oss-web.vercel.app/friends" style="color:#4caf50;">管理画面で確認 →</a></p>
    `,
  });
}

export async function notifyChallengeComplete(resendApiKey: string, displayName: string | null) {
  await sendNotification(resendApiKey, {
    subject: 'チャレンジ完走 🎉',
    html: `
      <h2>🎉 7日間チャレンジを完走しました</h2>
      <table style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px;color:#666;">名前</td><td style="padding:8px;font-weight:bold;">${esc(displayName) || '未取得'}</td></tr>
        <tr><td style="padding:8px;color:#666;">日時</td><td style="padding:8px;">${nowJST()}</td></tr>
      </table>
      <p style="color:#666;font-size:13px;margin-top:8px;">※ 入会に至っていない場合は、Day 10にフォローアップメッセージが自動送信されます。</p>
      <p style="margin-top:16px;"><a href="https://line-harness-oss-web.vercel.app/friends" style="color:#4caf50;">管理画面で確認 →</a></p>
    `,
  });
}

export async function notifyPaymentFailed(resendApiKey: string, displayName: string | null, errorMessage: string | null) {
  await sendNotification(resendApiKey, {
    subject: '❗ 決済失敗',
    html: `
      <h2>❗ 決済が失敗しました</h2>
      <table style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px;color:#666;">名前</td><td style="padding:8px;font-weight:bold;">${esc(displayName) || '未取得'}</td></tr>
        <tr><td style="padding:8px;color:#666;">エラー</td><td style="padding:8px;color:#e53935;">${esc(errorMessage) || '不明'}</td></tr>
        <tr><td style="padding:8px;color:#666;">日時</td><td style="padding:8px;">${nowJST()}</td></tr>
      </table>
      <p style="color:#e53935;font-size:13px;margin-top:8px;">※ カード期限切れや残高不足の可能性があります。早めにユーザーに連絡してください。</p>
    `,
  });
}

export async function notifyUnmatchedMessage(resendApiKey: string, displayName: string | null, messageText: string) {
  await sendNotification(resendApiKey, {
    subject: '手動対応が必要なメッセージ',
    html: `
      <h2>💬 自動応答できなかったメッセージがあります</h2>
      <table style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px;color:#666;">送信者</td><td style="padding:8px;font-weight:bold;">${esc(displayName) || '未取得'}</td></tr>
        <tr><td style="padding:8px;color:#666;">メッセージ</td><td style="padding:8px;">${esc(messageText)}</td></tr>
        <tr><td style="padding:8px;color:#666;">日時</td><td style="padding:8px;">${nowJST()}</td></tr>
      </table>
      <p style="margin-top:16px;"><a href="https://line-harness-oss-web.vercel.app/chats" style="color:#4caf50;">個別チャットで返信 →</a></p>
    `,
  });
}

export async function sendDailySummary(resendApiKey: string, db: D1Database) {
  const today = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });

  const totalFriends = await db.prepare('SELECT COUNT(*) as count FROM friends').first<{ count: number }>();
  const todayFriends = await db.prepare("SELECT COUNT(*) as count FROM friends WHERE DATE(created_at) = DATE('now')").first<{ count: number }>();
  const activeMembers = await db.prepare("SELECT COUNT(*) as count FROM friends WHERE subscription_status IN ('active', 'trialing')").first<{ count: number }>();
  const todayDeliveries = await db.prepare("SELECT COUNT(*) as count FROM delivery_logs WHERE DATE(sent_at) = DATE('now') AND status = 'sent'").first<{ count: number }>();
  const activeSequences = await db.prepare("SELECT COUNT(*) as count FROM user_sequences WHERE status = 'active'").first<{ count: number }>();

  await sendNotification(resendApiKey, {
    subject: `日次レポート（${today}）`,
    html: `
      <h2>📊 整体卒業サロン 日次レポート</h2>
      <p style="color:#666;font-size:13px;">${today}</p>
      <table style="border-collapse:collapse;font-size:14px;width:100%;max-width:400px;">
        <tr style="background:#f5f5f5;"><td style="padding:10px;">総友だち数</td><td style="padding:10px;text-align:right;font-weight:bold;">${totalFriends?.count ?? 0}人</td></tr>
        <tr><td style="padding:10px;">本日の新規追加</td><td style="padding:10px;text-align:right;font-weight:bold;">${todayFriends?.count ?? 0}人</td></tr>
        <tr style="background:#f5f5f5;"><td style="padding:10px;">有料会員数</td><td style="padding:10px;text-align:right;font-weight:bold;">${activeMembers?.count ?? 0}人</td></tr>
        <tr><td style="padding:10px;">本日の配信数</td><td style="padding:10px;text-align:right;font-weight:bold;">${todayDeliveries?.count ?? 0}通</td></tr>
        <tr style="background:#f5f5f5;"><td style="padding:10px;">チャレンジ進行中</td><td style="padding:10px;text-align:right;font-weight:bold;">${activeSequences?.count ?? 0}人</td></tr>
      </table>
      <p style="margin-top:16px;"><a href="https://line-harness-oss-web.vercel.app" style="color:#4caf50;">管理画面を開く →</a></p>
    `,
  });
}
