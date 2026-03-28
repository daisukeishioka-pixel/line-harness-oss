import { jstNow } from './utils';

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  category: string;
  og_image_url: string | null;
  is_published: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export type BlogPostSummary = Omit<BlogPost, 'body'>;

const SUMMARY_COLUMNS =
  'id, slug, title, excerpt, category, og_image_url, is_published, published_at, created_at, updated_at';

export async function getBlogPosts(
  db: D1Database,
  opts?: { category?: string; limit?: number; offset?: number; publishedOnly?: boolean },
): Promise<{ items: BlogPostSummary[]; total: number }> {
  const conditions: string[] = [];
  const binds: unknown[] = [];

  if (opts?.publishedOnly !== false) {
    conditions.push('is_published = 1');
  }
  if (opts?.category) {
    conditions.push('category = ?');
    binds.push(opts.category);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = opts?.limit ?? 10;
  const offset = opts?.offset ?? 0;

  const countBinds = [...binds];

  const [rows, countRow] = await Promise.all([
    db
      .prepare(
        `SELECT ${SUMMARY_COLUMNS} FROM blog_posts ${where} ORDER BY published_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, limit, offset)
      .all<BlogPostSummary>(),
    db
      .prepare(`SELECT COUNT(*) as count FROM blog_posts ${where}`)
      .bind(...countBinds)
      .first<{ count: number }>(),
  ]);

  return { items: rows.results ?? [], total: countRow?.count ?? 0 };
}

export async function getBlogPostBySlug(db: D1Database, slug: string): Promise<BlogPost | null> {
  return db
    .prepare(`SELECT * FROM blog_posts WHERE slug = ? AND is_published = 1`)
    .bind(slug)
    .first<BlogPost>();
}

export async function getBlogPostById(db: D1Database, id: string): Promise<BlogPost | null> {
  return db.prepare(`SELECT * FROM blog_posts WHERE id = ?`).bind(id).first<BlogPost>();
}

export async function getLatestBlogPosts(
  db: D1Database,
  limit = 5,
): Promise<BlogPostSummary[]> {
  const rows = await db
    .prepare(
      `SELECT ${SUMMARY_COLUMNS} FROM blog_posts WHERE is_published = 1 ORDER BY published_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all<BlogPostSummary>();
  return rows.results ?? [];
}

export async function createBlogPost(
  db: D1Database,
  data: {
    slug: string;
    title: string;
    excerpt: string;
    body: string;
    category: string;
    ogImageUrl?: string | null;
    isPublished?: boolean;
  },
): Promise<BlogPost> {
  const id = crypto.randomUUID();
  const now = jstNow();
  const isPublished = data.isPublished ? 1 : 0;
  const publishedAt = data.isPublished ? now : null;

  await db
    .prepare(
      `INSERT INTO blog_posts (id, slug, title, excerpt, body, category, og_image_url, is_published, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      data.slug,
      data.title,
      data.excerpt,
      data.body,
      data.category,
      data.ogImageUrl ?? null,
      isPublished,
      publishedAt,
      now,
      now,
    )
    .run();

  return (await getBlogPostById(db, id))!;
}

export async function updateBlogPost(
  db: D1Database,
  id: string,
  data: Partial<{
    slug: string;
    title: string;
    excerpt: string;
    body: string;
    category: string;
    ogImageUrl: string | null;
    isPublished: boolean;
  }>,
): Promise<BlogPost | null> {
  const current = await getBlogPostById(db, id);
  if (!current) return null;

  const sets: string[] = [];
  const binds: unknown[] = [];

  if (data.slug !== undefined) { sets.push('slug = ?'); binds.push(data.slug); }
  if (data.title !== undefined) { sets.push('title = ?'); binds.push(data.title); }
  if (data.excerpt !== undefined) { sets.push('excerpt = ?'); binds.push(data.excerpt); }
  if (data.body !== undefined) { sets.push('body = ?'); binds.push(data.body); }
  if (data.category !== undefined) { sets.push('category = ?'); binds.push(data.category); }
  if (data.ogImageUrl !== undefined) { sets.push('og_image_url = ?'); binds.push(data.ogImageUrl); }

  if (data.isPublished !== undefined) {
    sets.push('is_published = ?');
    binds.push(data.isPublished ? 1 : 0);
    if (data.isPublished && !current.published_at) {
      sets.push('published_at = ?');
      binds.push(jstNow());
    }
  }

  if (sets.length === 0) return current;

  sets.push('updated_at = ?');
  binds.push(jstNow());
  binds.push(id);

  await db.prepare(`UPDATE blog_posts SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  return getBlogPostById(db, id);
}

export async function deleteBlogPost(db: D1Database, id: string, hard = false): Promise<void> {
  if (hard) {
    await db.prepare(`DELETE FROM blog_posts WHERE id = ?`).bind(id).run();
  } else {
    await db
      .prepare(`UPDATE blog_posts SET is_published = 0, updated_at = ? WHERE id = ?`)
      .bind(jstNow(), id)
      .run();
  }
}
