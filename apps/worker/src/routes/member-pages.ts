import { Hono } from 'hono';
import { jstNow } from '@line-crm/db';
import type { Env } from '../index.js';

const memberPages = new Hono<Env>();

// ========== アクティビティ記録API ==========

// GET: 月別アクティビティ一覧
memberPages.get('/api/membership/:friendId/activities', async (c) => {
  try {
    const friendId = c.req.param('friendId');
    const month = c.req.query('month'); // YYYY-MM
    const db = c.env.DB;

    let query = `SELECT id, activity_type, content_id, note, activity_date, created_at FROM member_activities WHERE friend_id = ?`;
    const params: string[] = [friendId];

    if (month) {
      query += ` AND activity_date LIKE ?`;
      params.push(`${month}%`);
    }
    query += ` ORDER BY activity_date DESC`;

    const rows = await db.prepare(query).bind(...params).all<{
      id: string; activity_type: string; content_id: string | null;
      note: string | null; activity_date: string; created_at: string;
    }>();

    return c.json({ success: true, data: rows.results });
  } catch (err) {
    console.error('GET activities error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST: アクティビティ記録（手動入力 or コンテンツ視聴）
memberPages.post('/api/membership/:friendId/activities', async (c) => {
  try {
    const friendId = c.req.param('friendId');
    const body = await c.req.json<{
      activityType: string; contentId?: string; note?: string; activityDate: string;
    }>();
    const db = c.env.DB;
    const id = crypto.randomUUID();

    await db.prepare(
      `INSERT INTO member_activities (id, friend_id, activity_type, content_id, note, activity_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, friendId, body.activityType, body.contentId ?? null, body.note ?? null, body.activityDate, jstNow()).run();

    return c.json({ success: true, data: { id } });
  } catch (err) {
    console.error('POST activities error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 目標設定API ==========

memberPages.get('/api/membership/:friendId/goals', async (c) => {
  try {
    const friendId = c.req.param('friendId');
    const row = await c.env.DB.prepare(
      `SELECT id, goal_text, is_active FROM member_goals WHERE friend_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1`,
    ).bind(friendId).first<{ id: string; goal_text: string; is_active: number }>();
    return c.json({ success: true, data: row ?? null });
  } catch (err) {
    console.error('GET goals error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

memberPages.post('/api/membership/:friendId/goals', async (c) => {
  try {
    const friendId = c.req.param('friendId');
    const { goalText } = await c.req.json<{ goalText: string }>();
    const db = c.env.DB;
    const now = jstNow();

    // 既存の目標を無効化
    await db.prepare(`UPDATE member_goals SET is_active = 0, updated_at = ? WHERE friend_id = ? AND is_active = 1`).bind(now, friendId).run();

    const id = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO member_goals (id, friend_id, goal_text, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)`,
    ).bind(id, friendId, goalText, now, now).run();

    return c.json({ success: true, data: { id, goalText } });
  } catch (err) {
    console.error('POST goals error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== ニュースAPI (管理用 + 公開用) ==========

memberPages.get('/api/news', async (c) => {
  try {
    const db = c.env.DB;
    const publishedOnly = c.req.query('published') !== 'false';
    const limit = Number(c.req.query('limit') ?? '20');
    const where = publishedOnly ? 'WHERE is_published = 1' : '';
    const rows = await db.prepare(
      `SELECT id, title, body, category, is_published, published_at, created_at, updated_at FROM news ${where} ORDER BY published_at DESC LIMIT ?`,
    ).bind(limit).all<{
      id: string; title: string; body: string; category: string;
      is_published: number; published_at: string; created_at: string; updated_at: string;
    }>();
    return c.json({
      success: true,
      data: rows.results.map(r => ({
        id: r.id, title: r.title, body: r.body, category: r.category,
        isPublished: !!r.is_published, publishedAt: r.published_at,
        createdAt: r.created_at, updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    console.error('GET news error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

memberPages.post('/api/news', async (c) => {
  try {
    const body = await c.req.json<{ title: string; body: string; category?: string; isPublished?: boolean }>();
    const db = c.env.DB;
    const id = crypto.randomUUID();
    const now = jstNow();
    await db.prepare(
      `INSERT INTO news (id, title, body, category, is_published, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, body.title, body.body, body.category ?? 'info', body.isPublished !== false ? 1 : 0, now, now, now).run();
    return c.json({ success: true, data: { id } }, 201);
  } catch (err) {
    console.error('POST news error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

memberPages.put('/api/news/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ title?: string; body?: string; category?: string; isPublished?: boolean }>();
    const db = c.env.DB;
    const now = jstNow();
    const sets: string[] = ['updated_at = ?'];
    const vals: (string | number)[] = [now];

    if (body.title !== undefined) { sets.push('title = ?'); vals.push(body.title); }
    if (body.body !== undefined) { sets.push('body = ?'); vals.push(body.body); }
    if (body.category !== undefined) { sets.push('category = ?'); vals.push(body.category); }
    if (body.isPublished !== undefined) { sets.push('is_published = ?'); vals.push(body.isPublished ? 1 : 0); }

    vals.push(id);
    await db.prepare(`UPDATE news SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('PUT news error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

memberPages.delete('/api/news/:id', async (c) => {
  try {
    await c.env.DB.prepare(`DELETE FROM news WHERE id = ?`).bind(c.req.param('id')).run();
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE news error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 会員ページ用 公開ニュースAPI ==========

memberPages.get('/api/membership/:friendId/news', async (c) => {
  try {
    const limit = Number(c.req.query('limit') ?? '5');
    const rows = await c.env.DB.prepare(
      `SELECT id, title, body, category, published_at FROM news WHERE is_published = 1 ORDER BY published_at DESC LIMIT ?`,
    ).bind(limit).all<{ id: string; title: string; body: string; category: string; published_at: string }>();
    return c.json({
      success: true,
      data: rows.results.map(r => ({
        id: r.id, title: r.title, body: r.body, category: r.category, publishedAt: r.published_at,
      })),
    });
  } catch (err) {
    console.error('GET membership news error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { memberPages };
