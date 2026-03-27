import { jstNow } from './utils';

export interface Schedule {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  live_url: string | null;
  archive_url: string | null;
  thumbnail_url: string | null;
  is_published: number;
  created_at: string;
  updated_at: string;
}

export async function getSchedules(
  db: D1Database,
  opts?: { upcoming?: boolean; publishedOnly?: boolean },
): Promise<Schedule[]> {
  const conditions: string[] = [];

  if (opts?.publishedOnly) {
    conditions.push('is_published = 1');
  }
  if (opts?.upcoming) {
    conditions.push(`scheduled_at >= datetime('now', '+9 hours')`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const order = opts?.upcoming ? 'ASC' : 'DESC';
  const rows = await db
    .prepare(`SELECT * FROM schedules ${where} ORDER BY scheduled_at ${order}`)
    .all<Schedule>();
  return rows.results ?? [];
}

export async function getScheduleById(db: D1Database, id: string): Promise<Schedule | null> {
  return db.prepare(`SELECT * FROM schedules WHERE id = ?`).bind(id).first<Schedule>();
}

export async function createSchedule(
  db: D1Database,
  data: {
    title: string;
    description?: string | null;
    scheduledAt: string;
    liveUrl?: string | null;
    archiveUrl?: string | null;
    thumbnailUrl?: string | null;
  },
): Promise<Schedule> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db
    .prepare(
      `INSERT INTO schedules (id, title, description, scheduled_at, live_url, archive_url, thumbnail_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, data.title, data.description ?? null, data.scheduledAt, data.liveUrl ?? null, data.archiveUrl ?? null, data.thumbnailUrl ?? null, now, now)
    .run();
  return (await getScheduleById(db, id))!;
}

export async function updateSchedule(
  db: D1Database,
  id: string,
  data: Partial<{
    title: string;
    description: string | null;
    scheduledAt: string;
    liveUrl: string | null;
    archiveUrl: string | null;
    thumbnailUrl: string | null;
    isPublished: boolean;
  }>,
): Promise<Schedule | null> {
  const sets: string[] = [];
  const binds: unknown[] = [];

  if (data.title !== undefined) { sets.push('title = ?'); binds.push(data.title); }
  if (data.description !== undefined) { sets.push('description = ?'); binds.push(data.description); }
  if (data.scheduledAt !== undefined) { sets.push('scheduled_at = ?'); binds.push(data.scheduledAt); }
  if (data.liveUrl !== undefined) { sets.push('live_url = ?'); binds.push(data.liveUrl); }
  if (data.archiveUrl !== undefined) { sets.push('archive_url = ?'); binds.push(data.archiveUrl); }
  if (data.thumbnailUrl !== undefined) { sets.push('thumbnail_url = ?'); binds.push(data.thumbnailUrl); }
  if (data.isPublished !== undefined) { sets.push('is_published = ?'); binds.push(data.isPublished ? 1 : 0); }

  if (sets.length === 0) return getScheduleById(db, id);

  sets.push('updated_at = ?');
  binds.push(jstNow());
  binds.push(id);

  await db.prepare(`UPDATE schedules SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  return getScheduleById(db, id);
}

export async function deleteSchedule(db: D1Database, id: string): Promise<void> {
  await db.prepare(`DELETE FROM schedules WHERE id = ?`).bind(id).run();
}
