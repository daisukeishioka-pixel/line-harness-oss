import { Hono } from 'hono';
import type { Env } from '../index.js';

const sequences = new Hono<Env>();

// GET /api/admin/sequences — アクティブなシーケンス一覧
sequences.get('/api/admin/sequences', async (c) => {
  const db = c.env.DB;
  const status = c.req.query('status') || 'active';

  const results = await db
    .prepare(
      'SELECT us.*, (SELECT COUNT(*) FROM delivery_logs dl WHERE dl.line_user_id = us.line_user_id AND dl.sequence_name = us.sequence_name) as delivery_count FROM user_sequences us WHERE us.status = ? ORDER BY us.created_at DESC LIMIT 100',
    )
    .bind(status)
    .all();

  return c.json({ success: true, data: results.results });
});

// GET /api/admin/sequences/:lineUserId — 特定ユーザーのシーケンス詳細
sequences.get('/api/admin/sequences/:lineUserId', async (c) => {
  const lineUserId = c.req.param('lineUserId');
  const db = c.env.DB;

  const sequence = await db
    .prepare('SELECT * FROM user_sequences WHERE line_user_id = ? ORDER BY created_at DESC')
    .bind(lineUserId)
    .all();

  const logs = await db
    .prepare('SELECT * FROM delivery_logs WHERE line_user_id = ? ORDER BY sent_at DESC')
    .bind(lineUserId)
    .all();

  return c.json({
    success: true,
    data: {
      sequences: sequence.results,
      delivery_logs: logs.results,
    },
  });
});

// GET /api/admin/delivery-logs — 配信ログ一覧（最新50件）
sequences.get('/api/admin/delivery-logs', async (c) => {
  const db = c.env.DB;
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);

  const results = await db
    .prepare('SELECT * FROM delivery_logs ORDER BY sent_at DESC LIMIT ?')
    .bind(limit)
    .all();

  return c.json({ success: true, data: results.results });
});

// GET /api/admin/step-messages — ステップメッセージ一覧
sequences.get('/api/admin/step-messages', async (c) => {
  const db = c.env.DB;
  const sequenceName = c.req.query('sequence_name') || '7day_challenge';

  const results = await db
    .prepare('SELECT * FROM step_messages WHERE sequence_name = ? ORDER BY step_number ASC')
    .bind(sequenceName)
    .all();

  return c.json({ success: true, data: results.results });
});

// PUT /api/admin/step-messages/:id — ステップメッセージの更新
sequences.put('/api/admin/step-messages/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const body = await c.req.json<{ content?: string; delay_hours?: number; is_active?: number }>();

  // 既存レコード確認
  const existing = await db
    .prepare('SELECT id FROM step_messages WHERE id = ?')
    .bind(id)
    .first();

  if (!existing) {
    return c.json({ success: false, error: 'Step message not found' }, 404);
  }

  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (body.content !== undefined) {
    updates.push('content = ?');
    values.push(body.content);
  }
  if (body.delay_hours !== undefined) {
    updates.push('delay_hours = ?');
    values.push(body.delay_hours);
  }
  if (body.is_active !== undefined) {
    updates.push('is_active = ?');
    values.push(body.is_active);
  }

  if (updates.length === 0) {
    return c.json({ success: false, error: 'No fields to update' }, 400);
  }

  updates.push("updated_at = datetime('now')");
  values.push(Number(id));

  await db
    .prepare(`UPDATE step_messages SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  const updated = await db
    .prepare('SELECT * FROM step_messages WHERE id = ?')
    .bind(id)
    .first();

  return c.json({ success: true, data: updated });
});

export { sequences };
