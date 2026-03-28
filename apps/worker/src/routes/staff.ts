import { Hono } from 'hono';
import { jstNow } from '@line-crm/db';
import type { Env } from '../index.js';

const staff = new Hono<Env>();

type StaffRole = 'owner' | 'admin' | 'staff';

// ========== スタッフ一覧 ==========
staff.get('/api/staff', async (c) => {
  try {
    const rows = await c.env.DB.prepare(
      `SELECT id, name, email, role, is_active, created_at, updated_at FROM staff_members ORDER BY
        CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END, created_at ASC`,
    ).all<{
      id: string; name: string; email: string | null; role: string;
      is_active: number; created_at: string; updated_at: string;
    }>();

    return c.json({
      success: true,
      data: rows.results.map(r => ({
        id: r.id, name: r.name, email: r.email, role: r.role,
        isActive: !!r.is_active, createdAt: r.created_at, updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/staff error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 自分の情報 ==========
staff.get('/api/staff/me', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return c.json({ success: true, data: null });

    // まずstaff_membersから検索
    const staffMember = await c.env.DB.prepare(
      `SELECT id, name, email, role, is_active FROM staff_members WHERE api_key = ? AND is_active = 1`,
    ).bind(token).first<{ id: string; name: string; email: string | null; role: string; is_active: number }>();

    if (staffMember) {
      return c.json({
        success: true,
        data: { id: staffMember.id, name: staffMember.name, email: staffMember.email, role: staffMember.role },
      });
    }

    // 環境変数のAPI_KEYと一致する場合はオーナー扱い
    if (token === c.env.API_KEY) {
      return c.json({
        success: true,
        data: { id: 'owner', name: 'オーナー', email: null, role: 'owner' },
      });
    }

    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('GET /api/staff/me error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== スタッフ作成 ==========
staff.post('/api/staff', async (c) => {
  try {
    const body = await c.req.json<{ name: string; email?: string; role?: StaffRole }>();
    if (!body.name) return c.json({ success: false, error: 'name is required' }, 400);

    const db = c.env.DB;
    const id = crypto.randomUUID();
    const apiKey = `lh_${crypto.randomUUID().replace(/-/g, '')}`;
    const role = body.role || 'staff';
    const now = jstNow();

    await db.prepare(
      `INSERT INTO staff_members (id, name, email, role, api_key, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    ).bind(id, body.name, body.email ?? null, role, apiKey, now, now).run();

    return c.json({
      success: true,
      data: { id, name: body.name, email: body.email ?? null, role, apiKey },
    }, 201);
  } catch (err) {
    console.error('POST /api/staff error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== スタッフ更新 ==========
staff.put('/api/staff/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ name?: string; email?: string; role?: StaffRole; isActive?: boolean }>();
    const db = c.env.DB;
    const now = jstNow();

    const sets: string[] = ['updated_at = ?'];
    const vals: (string | number)[] = [now];

    if (body.name !== undefined) { sets.push('name = ?'); vals.push(body.name); }
    if (body.email !== undefined) { sets.push('email = ?'); vals.push(body.email); }
    if (body.role !== undefined) { sets.push('role = ?'); vals.push(body.role); }
    if (body.isActive !== undefined) { sets.push('is_active = ?'); vals.push(body.isActive ? 1 : 0); }

    vals.push(id);
    await db.prepare(`UPDATE staff_members SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('PUT /api/staff error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== APIキー再発行 ==========
staff.post('/api/staff/:id/regenerate-key', async (c) => {
  try {
    const id = c.req.param('id');
    const newKey = `lh_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = jstNow();

    await c.env.DB.prepare(
      `UPDATE staff_members SET api_key = ?, updated_at = ? WHERE id = ?`,
    ).bind(newKey, now, id).run();

    return c.json({ success: true, data: { apiKey: newKey } });
  } catch (err) {
    console.error('POST /api/staff/regenerate-key error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== スタッフ削除 ==========
staff.delete('/api/staff/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const db = c.env.DB;

    // オーナーが最後の1人の場合は削除不可
    const member = await db.prepare(`SELECT role FROM staff_members WHERE id = ?`).bind(id).first<{ role: string }>();
    if (member?.role === 'owner') {
      const ownerCount = await db.prepare(`SELECT COUNT(*) as cnt FROM staff_members WHERE role = 'owner' AND is_active = 1`).first<{ cnt: number }>();
      if ((ownerCount?.cnt ?? 0) <= 1) {
        return c.json({ success: false, error: '最低1人のオーナーが必要です' }, 400);
      }
    }

    await db.prepare(`DELETE FROM staff_members WHERE id = ?`).bind(id).run();
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/staff error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { staff };
