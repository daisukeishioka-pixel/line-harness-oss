import { Hono } from 'hono';
import {
  getContents,
  getContentById,
  createContent,
  updateContent,
  deleteContent,
  getSchedules,
  getScheduleById,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  jstNow,
} from '@line-crm/db';
import type { Env } from '../index.js';

const salon = new Hono<Env>();

// ========== Stripe API ヘルパー (invoices用) ==========

async function stripeGet(secretKey: string, path: string): Promise<unknown> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  return res.json();
}

// ========== コンテンツ一覧 (LIFF用: 公開のみ / 管理用: 全件) ==========

salon.get('/api/membership/:friendId/content', async (c) => {
  try {
    const friendId = c.req.param('friendId');
    const db = c.env.DB;

    // 会員かどうか確認
    const friend = await db
      .prepare(`SELECT subscription_status FROM friends WHERE id = ?`)
      .bind(friendId)
      .first<{ subscription_status: string | null }>();

    if (!friend) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }

    const isMember = friend.subscription_status === 'active' || friend.subscription_status === 'trialing' || friend.subscription_status === 'paused' || friend.subscription_status === 'cancel_scheduled';

    const items = await getContents(db, { publishedOnly: true });

    return c.json({
      success: true,
      data: {
        isMember,
        items: items.map((item) => ({
          id: item.id,
          title: item.title,
          category: item.category,
          description: item.description,
          videoUrl: isMember ? item.video_url : null,
          thumbnailUrl: item.thumbnail_url,
          duration: item.duration,
        })),
      },
    });
  } catch (err) {
    console.error('GET /api/membership/:friendId/content error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== Live配信スケジュール ==========

salon.get('/api/membership/:friendId/schedule', async (c) => {
  try {
    const items = await getSchedules(c.env.DB, { upcoming: true, publishedOnly: true });
    return c.json({
      success: true,
      data: items.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        scheduledAt: s.scheduled_at,
        liveUrl: s.live_url,
        archiveUrl: s.archive_url,
      })),
    });
  } catch (err) {
    console.error('GET /api/membership/:friendId/schedule error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== プロフィール更新 ==========

salon.put('/api/membership/:friendId/profile', async (c) => {
  try {
    const friendId = c.req.param('friendId');
    const db = c.env.DB;
    const body = await c.req.json<{
      displayName?: string;
      goal?: string;
      bodyParts?: string;
    }>();

    const friend = await db
      .prepare(`SELECT id, metadata FROM friends WHERE id = ?`)
      .bind(friendId)
      .first<{ id: string; metadata: string }>();

    if (!friend) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }

    const now = jstNow();
    const existing = JSON.parse(friend.metadata || '{}');
    const updated = {
      ...existing,
      ...(body.goal !== undefined ? { goal: body.goal } : {}),
      ...(body.bodyParts !== undefined ? { bodyParts: body.bodyParts } : {}),
    };

    const sets: string[] = ['metadata = ?', 'updated_at = ?'];
    const binds: unknown[] = [JSON.stringify(updated), now];

    if (body.displayName !== undefined) {
      sets.push('display_name = ?');
      binds.push(body.displayName);
    }

    binds.push(friendId);
    await db.prepare(`UPDATE friends SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();

    return c.json({ success: true, data: { displayName: body.displayName, ...updated } });
  } catch (err) {
    console.error('PUT /api/membership/:friendId/profile error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 支払い履歴 (Stripe Invoices) ==========

salon.get('/api/membership/:friendId/invoices', async (c) => {
  try {
    const friendId = c.req.param('friendId');
    const stripeKey = (c.env as unknown as Record<string, string | undefined>).STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return c.json({ success: false, error: 'Stripe is not configured' }, 500);
    }

    const friend = await c.env.DB
      .prepare(`SELECT stripe_customer_id FROM friends WHERE id = ?`)
      .bind(friendId)
      .first<{ stripe_customer_id: string | null }>();

    if (!friend?.stripe_customer_id) {
      return c.json({ success: true, data: [] });
    }

    const result = (await stripeGet(
      stripeKey,
      `/invoices?customer=${friend.stripe_customer_id}&limit=24&status=paid`,
    )) as {
      data: Array<{
        id: string;
        amount_paid: number;
        currency: string;
        status: string;
        created: number;
        hosted_invoice_url: string | null;
        invoice_pdf: string | null;
      }>;
    };

    return c.json({
      success: true,
      data: (result.data ?? []).map((inv) => ({
        id: inv.id,
        amount: inv.amount_paid,
        currency: inv.currency,
        status: inv.status,
        createdAt: new Date(inv.created * 1000).toISOString(),
        receiptUrl: inv.hosted_invoice_url,
        pdfUrl: inv.invoice_pdf,
      })),
    });
  } catch (err) {
    console.error('GET /api/membership/:friendId/invoices error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 管理API: コンテンツCRUD ==========

salon.get('/api/contents', async (c) => {
  try {
    const category = c.req.query('category') ?? undefined;
    const items = await getContents(c.env.DB, { category });
    return c.json({
      success: true,
      data: items.map((item) => ({
        id: item.id,
        title: item.title,
        category: item.category,
        description: item.description,
        videoUrl: item.video_url,
        thumbnailUrl: item.thumbnail_url,
        duration: item.duration,
        isPublished: Boolean(item.is_published),
        sortOrder: item.sort_order,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/contents error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

salon.post('/api/contents', async (c) => {
  try {
    const body = await c.req.json<{
      title: string;
      category: string;
      description?: string | null;
      videoUrl?: string | null;
      thumbnailUrl?: string | null;
      duration?: number | null;
      sortOrder?: number;
    }>();

    if (!body.title || !body.category) {
      return c.json({ success: false, error: 'title and category are required' }, 400);
    }

    const item = await createContent(c.env.DB, body);
    return c.json({ success: true, data: item }, 201);
  } catch (err) {
    console.error('POST /api/contents error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

salon.put('/api/contents/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const item = await updateContent(c.env.DB, id, body);
    if (!item) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true, data: item });
  } catch (err) {
    console.error('PUT /api/contents/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

salon.delete('/api/contents/:id', async (c) => {
  try {
    await deleteContent(c.env.DB, c.req.param('id'));
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/contents/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 管理API: スケジュールCRUD ==========

salon.get('/api/schedules', async (c) => {
  try {
    const items = await getSchedules(c.env.DB);
    return c.json({
      success: true,
      data: items.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        scheduledAt: s.scheduled_at,
        liveUrl: s.live_url,
        archiveUrl: s.archive_url,
        thumbnailUrl: s.thumbnail_url,
        isPublished: Boolean(s.is_published),
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/schedules error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

salon.post('/api/schedules', async (c) => {
  try {
    const body = await c.req.json<{
      title: string;
      description?: string | null;
      scheduledAt: string;
      liveUrl?: string | null;
      archiveUrl?: string | null;
      thumbnailUrl?: string | null;
    }>();

    if (!body.title || !body.scheduledAt) {
      return c.json({ success: false, error: 'title and scheduledAt are required' }, 400);
    }

    const item = await createSchedule(c.env.DB, body);
    return c.json({ success: true, data: item }, 201);
  } catch (err) {
    console.error('POST /api/schedules error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

salon.put('/api/schedules/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const item = await updateSchedule(c.env.DB, id, body);
    if (!item) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true, data: item });
  } catch (err) {
    console.error('PUT /api/schedules/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

salon.delete('/api/schedules/:id', async (c) => {
  try {
    await deleteSchedule(c.env.DB, c.req.param('id'));
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/schedules/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { salon };
