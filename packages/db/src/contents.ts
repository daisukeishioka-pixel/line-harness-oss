import { jstNow } from './utils';

export interface Content {
  id: string;
  title: string;
  category: string;
  description: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  duration: number | null;
  is_published: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export async function getContents(
  db: D1Database,
  opts?: { category?: string; publishedOnly?: boolean },
): Promise<Content[]> {
  const conditions: string[] = [];
  const binds: unknown[] = [];

  if (opts?.publishedOnly) {
    conditions.push('is_published = 1');
  }
  if (opts?.category) {
    conditions.push('category = ?');
    binds.push(opts.category);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await db
    .prepare(`SELECT * FROM contents ${where} ORDER BY sort_order ASC, created_at DESC`)
    .bind(...binds)
    .all<Content>();
  return rows.results ?? [];
}

export async function getContentById(db: D1Database, id: string): Promise<Content | null> {
  return db.prepare(`SELECT * FROM contents WHERE id = ?`).bind(id).first<Content>();
}

export async function createContent(
  db: D1Database,
  data: {
    title: string;
    category: string;
    description?: string | null;
    videoUrl?: string | null;
    thumbnailUrl?: string | null;
    duration?: number | null;
    sortOrder?: number;
  },
): Promise<Content> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db
    .prepare(
      `INSERT INTO contents (id, title, category, description, video_url, thumbnail_url, duration, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      data.title,
      data.category,
      data.description ?? null,
      data.videoUrl ?? null,
      data.thumbnailUrl ?? null,
      data.duration ?? null,
      data.sortOrder ?? 0,
      now,
      now,
    )
    .run();
  return (await getContentById(db, id))!;
}

export async function updateContent(
  db: D1Database,
  id: string,
  data: Partial<{
    title: string;
    category: string;
    description: string | null;
    videoUrl: string | null;
    thumbnailUrl: string | null;
    duration: number | null;
    isPublished: boolean;
    sortOrder: number;
  }>,
): Promise<Content | null> {
  const sets: string[] = [];
  const binds: unknown[] = [];

  if (data.title !== undefined) { sets.push('title = ?'); binds.push(data.title); }
  if (data.category !== undefined) { sets.push('category = ?'); binds.push(data.category); }
  if (data.description !== undefined) { sets.push('description = ?'); binds.push(data.description); }
  if (data.videoUrl !== undefined) { sets.push('video_url = ?'); binds.push(data.videoUrl); }
  if (data.thumbnailUrl !== undefined) { sets.push('thumbnail_url = ?'); binds.push(data.thumbnailUrl); }
  if (data.duration !== undefined) { sets.push('duration = ?'); binds.push(data.duration); }
  if (data.isPublished !== undefined) { sets.push('is_published = ?'); binds.push(data.isPublished ? 1 : 0); }
  if (data.sortOrder !== undefined) { sets.push('sort_order = ?'); binds.push(data.sortOrder); }

  if (sets.length === 0) return getContentById(db, id);

  sets.push('updated_at = ?');
  binds.push(jstNow());
  binds.push(id);

  await db.prepare(`UPDATE contents SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  return getContentById(db, id);
}

export async function deleteContent(db: D1Database, id: string): Promise<void> {
  await db.prepare(`DELETE FROM contents WHERE id = ?`).bind(id).run();
}
