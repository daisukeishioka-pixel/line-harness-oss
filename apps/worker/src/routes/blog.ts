import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  getBlogPosts,
  getBlogPostBySlug,
  getBlogPostById,
  getLatestBlogPosts,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
} from '@line-crm/db';
import type { Env } from '../index.js';

const blog = new Hono<Env>();

/** Validate Bearer token against API_KEY or staff_members (same logic as authMiddleware) */
async function isValidToken(c: Context<Env>): Promise<boolean> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice('Bearer '.length);
  if (!token) return false;
  if (token === c.env.API_KEY) return true;
  try {
    const staff = await c.env.DB.prepare(
      `SELECT id FROM staff_members WHERE api_key = ? AND is_active = 1`,
    ).bind(token).first();
    return !!staff;
  } catch {
    return false;
  }
}

function serializePost(p: { id: string; slug: string; title: string; excerpt: string; body?: string; category: string; og_image_url: string | null; is_published: number; published_at: string | null; created_at: string; updated_at: string }) {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    ...(p.body !== undefined ? { body: p.body } : {}),
    category: p.category,
    ogImageUrl: p.og_image_url,
    isPublished: !!p.is_published,
    publishedAt: p.published_at,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

// ========== 公開API ==========

blog.get('/api/blog/posts', async (c) => {
  try {
    const limit = Math.min(Number(c.req.query('limit') ?? 10), 100);
    const offset = Number(c.req.query('offset') ?? 0);
    const category = c.req.query('category') ?? undefined;
    const status = c.req.query('status');

    // status=all は認証済みリクエストのみ許可（トークン値を検証）
    const authenticated = await isValidToken(c);
    const publishedOnly = !(status === 'all' && authenticated);

    const { items, total } = await getBlogPosts(c.env.DB, {
      category,
      limit,
      offset,
      publishedOnly,
    });

    return c.json({
      success: true,
      data: {
        items: items.map((p) => serializePost(p)),
        total,
        limit,
        offset,
      },
    });
  } catch (err) {
    console.error('GET /api/blog/posts error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

blog.get('/api/blog/posts/latest', async (c) => {
  try {
    const limit = Math.min(Number(c.req.query('limit') ?? 5), 20);
    const items = await getLatestBlogPosts(c.env.DB, limit);

    return c.json({
      success: true,
      data: items.map((p) => serializePost(p)),
    });
  } catch (err) {
    console.error('GET /api/blog/posts/latest error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// 管理用: ID指定で記事取得（下書きも取得可能、認証必須）
blog.get('/api/blog/posts/by-id/:id', async (c) => {
  try {
    const authenticated = await isValidToken(c);
    if (!authenticated) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');
    const post = await getBlogPostById(c.env.DB, id);

    if (!post) {
      return c.json({ success: false, error: 'Post not found' }, 404);
    }

    return c.json({ success: true, data: serializePost(post) });
  } catch (err) {
    console.error('GET /api/blog/posts/by-id/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

blog.get('/api/blog/posts/:slug', async (c) => {
  try {
    const slug = c.req.param('slug');
    const post = await getBlogPostBySlug(c.env.DB, slug);

    if (!post) {
      return c.json({ success: false, error: 'Post not found' }, 404);
    }

    return c.json({ success: true, data: serializePost(post) });
  } catch (err) {
    console.error('GET /api/blog/posts/:slug error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 管���API (認証必須) ==========

blog.post('/api/blog/posts', async (c) => {
  try {
    const body = await c.req.json<{
      slug: string;
      title: string;
      excerpt: string;
      body: string;
      category: string;
      ogImageUrl?: string | null;
      isPublished?: boolean;
    }>();

    if (!body.slug || !body.title || !body.excerpt || !body.body || !body.category) {
      return c.json({ success: false, error: 'slug, title, excerpt, body, and category are required' }, 400);
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug)) {
      return c.json({ success: false, error: 'Slug must be lowercase alphanumeric with hyphens' }, 400);
    }

    if (body.slug === 'latest') {
      return c.json({ success: false, error: 'This slug is reserved' }, 400);
    }

    const post = await createBlogPost(c.env.DB, body);
    return c.json({ success: true, data: post }, 201);
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE constraint failed: blog_posts.slug')) {
      return c.json({ success: false, error: 'Slug already exists' }, 409);
    }
    console.error('POST /api/blog/posts error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

blog.put('/api/blog/posts/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<Partial<{
      slug: string;
      title: string;
      excerpt: string;
      body: string;
      category: string;
      ogImageUrl: string | null;
      isPublished: boolean;
    }>>();

    if (body.slug !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug)) {
      return c.json({ success: false, error: 'Slug must be lowercase alphanumeric with hyphens' }, 400);
    }

    if (body.slug === 'latest') {
      return c.json({ success: false, error: 'This slug is reserved' }, 400);
    }

    const post = await updateBlogPost(c.env.DB, id, body);
    if (!post) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true, data: post });
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE constraint failed: blog_posts.slug')) {
      return c.json({ success: false, error: 'Slug already exists' }, 409);
    }
    console.error('PUT /api/blog/posts/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

blog.delete('/api/blog/posts/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const hard = c.req.query('hard') === '1';
    await deleteBlogPost(c.env.DB, id, hard);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/blog/posts/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { blog };
