import { Hono } from 'hono';
import { jstNow } from '@line-crm/db';
import type { Env } from '../index.js';

const autoReplies = new Hono<Env>();

// GET /api/admin/auto-replies — 自動応答ルール一覧
autoReplies.get('/api/admin/auto-replies', async (c) => {
  const results = await c.env.DB.prepare(
    'SELECT * FROM auto_replies ORDER BY is_active DESC, created_at ASC',
  ).all();
  return c.json({ success: true, data: results.results });
});

// POST /api/admin/auto-replies — 新規ルール作成
autoReplies.post('/api/admin/auto-replies', async (c) => {
  const body = await c.req.json<{
    keyword: string;
    match_type?: string;
    response_type?: string;
    response_content: string;
  }>();

  if (!body.keyword || !body.response_content) {
    return c.json({ success: false, error: 'keyword and response_content are required' }, 400);
  }

  const id = `ar-${crypto.randomUUID().slice(0, 8)}`;
  const now = jstNow();

  await c.env.DB.prepare(
    'INSERT INTO auto_replies (id, keyword, match_type, response_type, response_content, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
  )
    .bind(
      id,
      body.keyword,
      body.match_type || 'contains',
      body.response_type || 'text',
      body.response_content,
      now,
    )
    .run();

  const created = await c.env.DB.prepare('SELECT * FROM auto_replies WHERE id = ?')
    .bind(id)
    .first();

  return c.json({ success: true, data: created }, 201);
});

// PUT /api/admin/auto-replies/:id — ルール更新
autoReplies.put('/api/admin/auto-replies/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    keyword?: string;
    match_type?: string;
    response_type?: string;
    response_content?: string;
    is_active?: number;
  }>();

  const existing = await c.env.DB.prepare('SELECT id FROM auto_replies WHERE id = ?')
    .bind(id)
    .first();
  if (!existing) {
    return c.json({ success: false, error: 'Auto-reply not found' }, 404);
  }

  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (body.keyword !== undefined) { updates.push('keyword = ?'); values.push(body.keyword); }
  if (body.match_type !== undefined) { updates.push('match_type = ?'); values.push(body.match_type); }
  if (body.response_type !== undefined) { updates.push('response_type = ?'); values.push(body.response_type); }
  if (body.response_content !== undefined) { updates.push('response_content = ?'); values.push(body.response_content); }
  if (body.is_active !== undefined) { updates.push('is_active = ?'); values.push(body.is_active); }

  if (updates.length === 0) {
    return c.json({ success: false, error: 'No fields to update' }, 400);
  }

  values.push(id);

  await c.env.DB.prepare(`UPDATE auto_replies SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  const updated = await c.env.DB.prepare('SELECT * FROM auto_replies WHERE id = ?')
    .bind(id)
    .first();

  return c.json({ success: true, data: updated });
});

// DELETE /api/admin/auto-replies/:id — ルール削除
autoReplies.delete('/api/admin/auto-replies/:id', async (c) => {
  const id = c.req.param('id');

  const existing = await c.env.DB.prepare('SELECT id FROM auto_replies WHERE id = ?')
    .bind(id)
    .first();
  if (!existing) {
    return c.json({ success: false, error: 'Auto-reply not found' }, 404);
  }

  await c.env.DB.prepare('DELETE FROM auto_replies WHERE id = ?').bind(id).run();

  return c.json({ success: true, data: null });
});

export { autoReplies };
