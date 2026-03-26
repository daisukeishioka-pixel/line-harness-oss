import { Hono } from 'hono';
import type { Env } from '../index.js';

const trackingSources = new Hono<Env>();

// GET /track/:source — トラッキングURL（認証不要・公開URL）
// 注意: /t/:linkId は既存のtracked-links用なので /track/ を使用
trackingSources.get('/track/:source', async (c) => {
  const source = c.req.param('source');
  const trackingId = crypto.randomUUID();

  const ctx = c.executionCtx as ExecutionContext;
  ctx.waitUntil(
    c.env.DB.prepare(
      'INSERT INTO tracking_clicks (tracking_id, source, ip_address, user_agent) VALUES (?, ?, ?, ?)',
    )
      .bind(
        trackingId,
        source,
        c.req.header('cf-connecting-ip') || 'unknown',
        c.req.header('user-agent') || 'unknown',
      )
      .run()
      .catch((err) => console.error('Failed to record tracking click:', err)),
  );

  // Cookieをセットしてリダイレクト
  c.header(
    'Set-Cookie',
    `seitai_track=${trackingId}; Path=/; Max-Age=600; SameSite=Lax`,
  );
  return c.redirect('https://lin.ee/nEDpp27', 302);
});

// GET /api/admin/tracking/sources — 流入経路別の集計
trackingSources.get('/api/admin/tracking/sources', async (c) => {
  const db = c.env.DB;

  const results = await db
    .prepare(
      `SELECT
        source,
        COUNT(*) as count,
        SUM(CASE WHEN matched_line_user_id IS NOT NULL THEN 1 ELSE 0 END) as converted
      FROM tracking_clicks
      GROUP BY source
      ORDER BY count DESC`,
    )
    .all<{ source: string; count: number; converted: number }>();

  return c.json({ success: true, data: results.results });
});

// GET /api/admin/tracking/clicks — クリックログ一覧
trackingSources.get('/api/admin/tracking/clicks', async (c) => {
  const db = c.env.DB;
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);

  const results = await db
    .prepare('SELECT * FROM tracking_clicks ORDER BY clicked_at DESC LIMIT ?')
    .bind(limit)
    .all();

  return c.json({ success: true, data: results.results });
});

export { trackingSources };
