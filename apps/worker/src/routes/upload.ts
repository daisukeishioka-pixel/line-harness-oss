import { Hono } from 'hono';
import type { Env } from '../index.js';

const upload = new Hono<Env>();

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

upload.post('/api/upload/image', async (c) => {
  try {
    const formData = await c.req.formData();
    const raw = formData.get('file');

    if (!raw || typeof raw === 'string') {
      return c.json({ success: false, error: 'ファイルが選択されていません' }, 400);
    }

    const file = raw as unknown as File;

    // Validate file type
    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return c.json(
        { success: false, error: '対応形式: JPG, PNG, WebP のみアップロード可能です' },
        400,
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return c.json(
        { success: false, error: 'ファイルサイズは5MB以下にしてください' },
        400,
      );
    }

    // Generate unique filename: blog/{timestamp}-{random}.{ext}
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    const key = `blog/${timestamp}-${random}.${ext}`;

    // Upload to R2
    const arrayBuffer = await file.arrayBuffer();
    await c.env.IMAGE_BUCKET.put(key, arrayBuffer, {
      httpMetadata: {
        contentType: file.type,
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });

    // Build public URL
    const publicUrl = c.env.R2_PUBLIC_URL
      ? `${c.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`
      : `https://your-r2-public-url.example.com/${key}`;

    return c.json({ success: true, data: { url: publicUrl, key } }, 201);
  } catch (err) {
    console.error('POST /api/upload/image error:', err);
    return c.json({ success: false, error: 'アップロードに失敗しました' }, 500);
  }
});

export { upload };
