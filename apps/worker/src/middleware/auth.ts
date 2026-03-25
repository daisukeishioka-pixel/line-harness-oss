import type { Context, Next } from 'hono';
import type { Env } from '../index.js';

export async function authMiddleware(c: Context<Env>, next: Next): Promise<Response | void> {
  const path = new URL(c.req.url).pathname;

  // Public paths — no API_KEY required
  // These are protected by other means (LINE signature, Stripe signature, LIFF token, etc.)
  if (
    path === '/' ||
    path === '/docs' ||
    path === '/openapi.json' ||
    path === '/api/affiliates/click' ||
    path === '/api/integrations/stripe/webhook' ||
    path === '/api/checkout' ||
    path.startsWith('/webhook') ||
    path.startsWith('/liff') ||
    path.startsWith('/t/') ||
    path.startsWith('/r/') ||
    path.startsWith('/api/liff/') ||
    path.startsWith('/auth/') ||
    path.startsWith('/api/membership/') ||
    path.match(/^\/api\/webhooks\/incoming\/[^/]+\/receive$/) ||
    path.match(/^\/api\/forms\/[^/]+\/submit$/) ||
    path.match(/^\/api\/forms\/[^/]+$/) // GET form definition (public for LIFF)
  ) {
    return next();
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice('Bearer '.length);
  if (token !== c.env.API_KEY) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  return next();
}
