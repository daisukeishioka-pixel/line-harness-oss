import { Hono } from 'hono';
import type { Env } from '../index.js';

const csvExport = new Hono<Env>();

function today(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function escCsv(val: string | null | undefined): string {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// GET /api/admin/export/friends.csv
csvExport.get('/api/admin/export/friends.csv', async (c) => {
  const friends = await c.env.DB.prepare(
    'SELECT line_user_id, display_name, source, created_at, subscription_status FROM friends ORDER BY created_at DESC',
  ).all<{
    line_user_id: string;
    display_name: string | null;
    source: string | null;
    created_at: string;
    subscription_status: string | null;
  }>();

  const header = 'LINE ID,表示名,流入経路,追加日,ステータス\n';
  const rows = friends.results
    .map(
      (f) =>
        `${escCsv(f.line_user_id)},${escCsv(f.display_name)},${escCsv(f.source || 'direct')},${escCsv(f.created_at)},${escCsv(f.subscription_status || 'free')}`,
    )
    .join('\n');

  const csv = '\uFEFF' + header + rows;

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="friends_${today()}.csv"`,
    },
  });
});

// GET /api/admin/export/delivery-logs.csv
csvExport.get('/api/admin/export/delivery-logs.csv', async (c) => {
  const logs = await c.env.DB.prepare(
    'SELECT line_user_id, sequence_name, step_number, status, sent_at, error_message FROM delivery_logs ORDER BY sent_at DESC',
  ).all<{
    line_user_id: string;
    sequence_name: string;
    step_number: number;
    status: string;
    sent_at: string;
    error_message: string | null;
  }>();

  const header = 'LINE ID,シーケンス名,ステップ番号,ステータス,送信日時,エラーメッセージ\n';
  const rows = logs.results
    .map(
      (l) =>
        `${escCsv(l.line_user_id)},${escCsv(l.sequence_name)},${l.step_number},${escCsv(l.status)},${escCsv(l.sent_at)},${escCsv(l.error_message)}`,
    )
    .join('\n');

  const csv = '\uFEFF' + header + rows;

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="delivery-logs_${today()}.csv"`,
    },
  });
});

// GET /api/admin/export/payments.csv
csvExport.get('/api/admin/export/payments.csv', async (c) => {
  // friendsテーブルのsubscription情報から簡易版を生成
  const friends = await c.env.DB.prepare(
    `SELECT line_user_id, display_name, subscription_status, stripe_customer_id, created_at
     FROM friends
     WHERE stripe_customer_id IS NOT NULL OR subscription_status IS NOT NULL
     ORDER BY created_at DESC`,
  ).all<{
    line_user_id: string;
    display_name: string | null;
    subscription_status: string | null;
    stripe_customer_id: string | null;
    created_at: string;
  }>();

  const header = 'LINE ID,表示名,金額,ステータス,登録日\n';
  const rows = friends.results
    .map(
      (f) =>
        `${escCsv(f.line_user_id)},${escCsv(f.display_name)},${f.subscription_status === 'active' || f.subscription_status === 'trialing' ? '2980' : '0'},${escCsv(f.subscription_status || 'free')},${escCsv(f.created_at)}`,
    )
    .join('\n');

  const csv = '\uFEFF' + header + rows;

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="payments_${today()}.csv"`,
    },
  });
});

export { csvExport };
