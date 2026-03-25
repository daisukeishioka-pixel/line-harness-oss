import { Hono } from 'hono';
import {
  getStripeEvents,
  getStripeEventByStripeId,
  createStripeEvent,
  getFriendByLineUserId,
  getFriendById,
  jstNow,
} from '@line-crm/db';
import { LineClient } from '@line-crm/line-sdk';
import type { Env } from '../index.js';

const stripe = new Hono<Env>();

const WORKERS_URL = 'https://line-crm-worker.seitai-graduation.workers.dev';
const PRICE_ID = 'price_1TEYQIB4Z2tRuVncR93UXX1p';

interface StripeWebhookBody {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      amount?: number;
      amount_total?: number;
      currency?: string;
      metadata?: Record<string, string>;
      customer?: string;
      subscription?: string;
      status?: string;
      mode?: string;
      payment_status?: string;
      client_reference_id?: string;
      current_period_end?: number;
      cancel_at_period_end?: boolean;
      cancel_at?: number | null;
      pause_collection?: { behavior: string; resumes_at?: number } | null;
      lines?: { data: Array<{ price?: { id: string } }> };
    };
  };
}

// ========== Stripe API ヘルパー ==========

async function stripeRequest(
  secretKey: string,
  method: string,
  path: string,
  body?: Record<string, string>,
): Promise<unknown> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  return res.json();
}

/** DB + Stripeキー + フレンド情報を取得する共通ヘルパー */
async function getMembershipContext(c: { env: Env['Bindings']; req: { param: (k: string) => string } }) {
  const friendId = c.req.param('friendId');
  const stripeKey = (c.env as unknown as Record<string, string | undefined>).STRIPE_SECRET_KEY;
  const db = c.env.DB;
  const friend = await db
    .prepare(`SELECT id, line_user_id, display_name, subscription_id, subscription_status, current_period_end, stripe_customer_id FROM friends WHERE id = ?`)
    .bind(friendId)
    .first<{
      id: string;
      line_user_id: string;
      display_name: string | null;
      subscription_id: string | null;
      subscription_status: string | null;
      current_period_end: string | null;
      stripe_customer_id: string | null;
    }>();
  return { friendId, stripeKey, db, friend };
}

/** タグを追加/削除するヘルパー */
async function addTag(db: D1Database, friendId: string, tagName: string) {
  const tag = await db.prepare(`SELECT id FROM tags WHERE name = ?`).bind(tagName).first<{ id: string }>();
  if (tag) {
    await db.prepare(`INSERT OR IGNORE INTO friend_tags (friend_id, tag_id, assigned_at) VALUES (?, ?, ?)`).bind(friendId, tag.id, jstNow()).run();
  }
}

async function removeTag(db: D1Database, friendId: string, tagName: string) {
  const tag = await db.prepare(`SELECT id FROM tags WHERE name = ?`).bind(tagName).first<{ id: string }>();
  if (tag) {
    await db.prepare(`DELETE FROM friend_tags WHERE friend_id = ? AND tag_id = ?`).bind(friendId, tag.id).run();
  }
}

/** LINE通知送信ヘルパー */
async function sendLineNotification(env: Env['Bindings'], lineUserId: string, text: string) {
  const token = env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return;
  try {
    const client = new LineClient(token);
    await client.pushTextMessage(lineUserId, text);
  } catch (err) {
    console.error('LINE notification failed:', err);
  }
}

// ========== Checkoutセッション作成 ==========

stripe.post('/api/checkout', async (c) => {
  try {
    const { friendId, lineUserId } = await c.req.json<{ friendId?: string; lineUserId?: string }>();
    const stripeKey = (c.env as unknown as Record<string, string | undefined>).STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return c.json({ success: false, error: 'Stripe is not configured' }, 500);
    }

    // friendIdまたはlineUserIdでフレンドを特定
    let friend: { id: string; line_user_id: string; display_name: string | null; stripe_customer_id?: string | null } | null = null;
    if (friendId) {
      friend = await c.env.DB.prepare(`SELECT id, line_user_id, display_name, stripe_customer_id FROM friends WHERE id = ?`).bind(friendId).first();
    } else if (lineUserId) {
      friend = await c.env.DB.prepare(`SELECT id, line_user_id, display_name, stripe_customer_id FROM friends WHERE line_user_id = ?`).bind(lineUserId).first();
    }

    if (!friend) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }

    // 既存のStripe Customerがあればそれを使う、なければ新規作成
    let customerId = friend.stripe_customer_id;
    if (!customerId) {
      const customer = (await stripeRequest(stripeKey, 'POST', '/customers', {
        'metadata[line_friend_id]': friend.id,
        'metadata[line_user_id]': friend.line_user_id,
        ...(friend.display_name ? { name: friend.display_name } : {}),
      })) as { id: string };
      customerId = customer.id;

      // Customerを保存
      await c.env.DB
        .prepare(`UPDATE friends SET stripe_customer_id = ?, updated_at = ? WHERE id = ?`)
        .bind(customerId, jstNow(), friend.id)
        .run();
    }

    // Checkout Session作成（カード＋口座振替対応）
    const session = (await stripeRequest(stripeKey, 'POST', '/checkout/sessions', {
      'customer': customerId,
      'mode': 'subscription',
      'line_items[0][price]': PRICE_ID,
      'line_items[0][quantity]': '1',
      'payment_method_types[0]': 'card',
      'payment_method_types[1]': 'customer_balance',
      'payment_method_options[customer_balance][funding_type]': 'bank_transfer',
      'payment_method_options[customer_balance][bank_transfer][type]': 'jp_bank_transfer',
      'success_url': `${WORKERS_URL}/api/membership/${friend.id}?status=success`,
      'cancel_url': `${WORKERS_URL}/api/membership/${friend.id}?status=cancelled`,
      'client_reference_id': friend.id,
      'metadata[line_friend_id]': friend.id,
      'metadata[line_user_id]': friend.line_user_id,
      'subscription_data[metadata][line_friend_id]': friend.id,
      'subscription_data[metadata][line_user_id]': friend.line_user_id,
    })) as { id: string; url: string };

    return c.json({
      success: true,
      data: { sessionId: session.id, url: session.url },
    });
  } catch (err) {
    console.error('POST /api/checkout error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 会員ステータスAPI ==========

stripe.get('/api/membership/:friendId', async (c) => {
  try {
    const friendId = c.req.param('friendId');
    const db = c.env.DB;
    const status = c.req.query('status');

    const friend = await db
      .prepare(`SELECT id, display_name, subscription_status, subscription_id, current_period_end, stripe_customer_id FROM friends WHERE id = ?`)
      .bind(friendId)
      .first<{
        id: string;
        display_name: string | null;
        subscription_status: string | null;
        subscription_id: string | null;
        current_period_end: string | null;
        stripe_customer_id: string | null;
      }>();

    if (!friend) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }

    // ブラウザからのアクセス（リダイレクト後）の場合はHTMLを返す
    const accept = c.req.header('Accept') ?? '';
    if (accept.includes('text/html') || status) {
      return c.html(renderMembershipPage(friend, status ?? undefined));
    }

    // API呼び出しの場合はJSONを返す
    return c.json({
      success: true,
      data: {
        friendId: friend.id,
        displayName: friend.display_name,
        subscriptionStatus: friend.subscription_status,
        subscriptionId: friend.subscription_id,
        currentPeriodEnd: friend.current_period_end,
        isActive: friend.subscription_status === 'active' || friend.subscription_status === 'trialing',
      },
    });
  } catch (err) {
    console.error('GET /api/membership error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== Customer Portal（解約用） ==========

stripe.post('/api/membership/:friendId/portal', async (c) => {
  try {
    const friendId = c.req.param('friendId');
    const stripeKey = (c.env as unknown as Record<string, string | undefined>).STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return c.json({ success: false, error: 'Stripe is not configured' }, 500);
    }

    const friend = await c.env.DB
      .prepare(`SELECT id, stripe_customer_id FROM friends WHERE id = ?`)
      .bind(friendId)
      .first<{ id: string; stripe_customer_id: string | null }>();

    if (!friend?.stripe_customer_id) {
      return c.json({ success: false, error: 'No Stripe customer found' }, 404);
    }

    const session = (await stripeRequest(stripeKey, 'POST', '/billing_portal/sessions', {
      customer: friend.stripe_customer_id,
      return_url: `${WORKERS_URL}/api/membership/${friendId}`,
    })) as { url: string };

    return c.json({ success: true, data: { url: session.url } });
  } catch (err) {
    console.error('POST /api/membership/portal error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 休会 ==========

stripe.post('/api/membership/:friendId/pause', async (c) => {
  try {
    const { friendId, stripeKey, db, friend } = await getMembershipContext(c);
    if (!stripeKey) return c.json({ success: false, error: 'Stripe is not configured' }, 500);
    if (!friend?.subscription_id) return c.json({ success: false, error: 'No active subscription' }, 404);
    if (friend.subscription_status !== 'active') {
      return c.json({ success: false, error: 'Subscription is not active' }, 400);
    }

    const now = jstNow();

    // 休会期間: 最大3ヶ月後に自動解除
    const resumesAt = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60;

    // Stripeのpause_collectionを設定
    await stripeRequest(stripeKey, 'POST', `/subscriptions/${friend.subscription_id}`, {
      'pause_collection[behavior]': 'void',
      'pause_collection[resumes_at]': String(resumesAt),
    });

    // D1ステータス更新
    await db
      .prepare(`UPDATE friends SET subscription_status = 'paused', updated_at = ? WHERE id = ?`)
      .bind(now, friendId)
      .run();

    // タグ操作: salon_memberは維持、subscription_pausedを追加
    await addTag(db, friendId, 'subscription_paused');

    // LINE通知
    await sendLineNotification(
      c.env,
      friend.line_user_id,
      `整体卒業サロンの休会手続きが完了しました。\n\n休会期間中は課金が停止されます。最大3ヶ月間休会可能で、期間を超過すると自動的に再開されます。\n\nいつでもマイページから復帰できます。`,
    );

    return c.json({ success: true, data: { status: 'paused' } });
  } catch (err) {
    console.error('POST /api/membership/pause error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 休会からの復帰 ==========

stripe.post('/api/membership/:friendId/resume', async (c) => {
  try {
    const { friendId, stripeKey, db, friend } = await getMembershipContext(c);
    if (!stripeKey) return c.json({ success: false, error: 'Stripe is not configured' }, 500);
    if (!friend?.subscription_id) return c.json({ success: false, error: 'No subscription found' }, 404);
    if (friend.subscription_status !== 'paused') {
      return c.json({ success: false, error: 'Subscription is not paused' }, 400);
    }

    const now = jstNow();

    // Stripeのpause_collectionを解除（空文字列で削除）
    await stripeRequest(stripeKey, 'POST', `/subscriptions/${friend.subscription_id}`, {
      'pause_collection': '',
    });

    // D1ステータス更新
    await db
      .prepare(`UPDATE friends SET subscription_status = 'active', updated_at = ? WHERE id = ?`)
      .bind(now, friendId)
      .run();

    // タグ操作
    await removeTag(db, friendId, 'subscription_paused');

    // LINE通知
    await sendLineNotification(
      c.env,
      friend.line_user_id,
      `整体卒業サロンへの復帰が完了しました！\n\nメンバーシップが再開されました。引き続きコンテンツをお楽しみください。`,
    );

    return c.json({ success: true, data: { status: 'active' } });
  } catch (err) {
    console.error('POST /api/membership/resume error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 退会（期間末キャンセル） ==========

stripe.post('/api/membership/:friendId/cancel', async (c) => {
  try {
    const { friendId, stripeKey, db, friend } = await getMembershipContext(c);
    if (!stripeKey) return c.json({ success: false, error: 'Stripe is not configured' }, 500);
    if (!friend?.subscription_id) return c.json({ success: false, error: 'No subscription found' }, 404);

    const status = friend.subscription_status;
    if (status !== 'active' && status !== 'paused') {
      return c.json({ success: false, error: 'Subscription cannot be cancelled' }, 400);
    }

    const now = jstNow();
    const { undo } = await c.req.json<{ undo?: boolean }>().catch(() => ({ undo: false }));

    if (undo) {
      // 退会キャンセル（退会予定を取り消す）
      await stripeRequest(stripeKey, 'POST', `/subscriptions/${friend.subscription_id}`, {
        'cancel_at_period_end': 'false',
      });

      // ステータスを元に戻す（休会中だった場合はpausedに）
      const restoredStatus = status === 'paused' ? 'paused' : 'active';
      await db
        .prepare(`UPDATE friends SET subscription_status = ?, updated_at = ? WHERE id = ?`)
        .bind(restoredStatus, now, friendId)
        .run();

      await sendLineNotification(
        c.env,
        friend.line_user_id,
        `退会のキャンセルが完了しました。\n\nメンバーシップは引き続きご利用いただけます。`,
      );

      return c.json({ success: true, data: { status: restoredStatus } });
    }

    // 期間末でキャンセル
    const sub = (await stripeRequest(stripeKey, 'POST', `/subscriptions/${friend.subscription_id}`, {
      'cancel_at_period_end': 'true',
    })) as { current_period_end?: number };

    // D1ステータスを退会予定に更新
    await db
      .prepare(`UPDATE friends SET subscription_status = 'cancel_scheduled', updated_at = ? WHERE id = ?`)
      .bind(now, friendId)
      .run();

    // LINE通知（利用可能期限を明記）
    const periodEndDate = sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
      : friend.current_period_end
        ? new Date(friend.current_period_end).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
        : '現在の請求期間末';

    await sendLineNotification(
      c.env,
      friend.line_user_id,
      `整体卒業サロンの退会手続きを受け付けました。\n\n${periodEndDate}まで引き続きコンテンツをご利用いただけます。\n\n退会を取り消したい場合は、マイページから「退会をキャンセルする」ボタンを押してください。`,
    );

    return c.json({ success: true, data: { status: 'cancel_scheduled', periodEnd: periodEndDate } });
  } catch (err) {
    console.error('POST /api/membership/cancel error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== Stripeイベント一覧 ==========

stripe.get('/api/integrations/stripe/events', async (c) => {
  try {
    const friendId = c.req.query('friendId') ?? undefined;
    const eventType = c.req.query('eventType') ?? undefined;
    const limit = Number(c.req.query('limit') ?? '100');
    const items = await getStripeEvents(c.env.DB, { friendId, eventType, limit });
    return c.json({
      success: true,
      data: items.map((e) => ({
        id: e.id,
        stripeEventId: e.stripe_event_id,
        eventType: e.event_type,
        friendId: e.friend_id,
        amount: e.amount,
        currency: e.currency,
        metadata: e.metadata ? JSON.parse(e.metadata) : null,
        processedAt: e.processed_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/integrations/stripe/events error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== Stripe Webhookレシーバー ==========

/** Stripe署名検証 */
async function verifyStripeSignature(secret: string, rawBody: string, sigHeader: string): Promise<boolean> {
  const parts = Object.fromEntries(
    sigHeader.split(',').map((p) => {
      const [k, ...v] = p.split('=');
      return [k, v.join('=')];
    }),
  );
  const timestamp = parts.t;
  const expectedSig = parts.v1;
  if (!timestamp || !expectedSig) return false;

  const encoder = new TextEncoder();
  const signedPayload = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const computedSig = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return computedSig === expectedSig;
}

stripe.post('/api/integrations/stripe/webhook', async (c) => {
  try {
    const stripeSecret = (c.env as unknown as Record<string, string | undefined>).STRIPE_WEBHOOK_SECRET;
    let body: StripeWebhookBody;

    if (stripeSecret) {
      const sigHeader = c.req.header('Stripe-Signature') ?? '';
      const rawBody = await c.req.text();
      const valid = await verifyStripeSignature(stripeSecret, rawBody, sigHeader);
      if (!valid) {
        return c.json({ success: false, error: 'Stripe signature verification failed' }, 401);
      }
      body = JSON.parse(rawBody) as StripeWebhookBody;
    } else {
      body = await c.req.json<StripeWebhookBody>();
    }

    // 冪等性チェック
    const existing = await getStripeEventByStripeId(c.env.DB, body.id);
    if (existing) {
      return c.json({ success: true, data: { message: 'Already processed' } });
    }

    const obj = body.data.object;
    const db = c.env.DB;
    const now = jstNow();

    // メタデータからfriendIdを取得
    const friendId = obj.metadata?.line_friend_id ?? obj.client_reference_id ?? null;

    // イベントを記録
    const event = await createStripeEvent(db, {
      stripeEventId: body.id,
      eventType: body.type,
      friendId: friendId ?? undefined,
      amount: obj.amount_total ?? obj.amount,
      currency: obj.currency,
      metadata: JSON.stringify(obj.metadata ?? {}),
    });

    // ========== checkout.session.completed ==========
    if (body.type === 'checkout.session.completed' && friendId) {
      const subscriptionId = obj.subscription as string | undefined;
      const customerId = obj.customer as string | undefined;

      // 口座振替の場合、payment_statusが'unpaid'になるため、
      // 実際の入金まではincompleteとして扱う
      const subscriptionStatus = obj.payment_status === 'unpaid' ? 'incomplete' : 'active';

      // サブスクリプション情報をfriendsに保存
      await db
        .prepare(
          `UPDATE friends SET
            stripe_customer_id = COALESCE(?, stripe_customer_id),
            subscription_id = COALESCE(?, subscription_id),
            subscription_status = ?,
            updated_at = ?
          WHERE id = ?`,
        )
        .bind(customerId ?? null, subscriptionId ?? null, subscriptionStatus, now, friendId)
        .run();

      // サブスクリプションの詳細を取得してcurrent_period_endを保存
      const stripeKey = (c.env as unknown as Record<string, string | undefined>).STRIPE_SECRET_KEY;
      if (stripeKey && subscriptionId) {
        try {
          const sub = (await stripeRequest(stripeKey, 'GET', `/subscriptions/${subscriptionId}`)) as {
            current_period_end?: number;
          };
          if (sub.current_period_end) {
            const periodEnd = new Date(sub.current_period_end * 1000).toISOString();
            await db
              .prepare(`UPDATE friends SET current_period_end = ? WHERE id = ?`)
              .bind(periodEnd, friendId)
              .run();
          }
        } catch {
          // サブスクリプション詳細取得失敗は非致命的
        }
      }

      // 口座振替で未払いの場合はタグ付け・スコアリングをスキップ
      // （入金後に customer.subscription.updated で active に更新される）
      if (subscriptionStatus === 'active') {
        // 自動タグ付け: salon_member
        const memberTag = await db
          .prepare(`SELECT id FROM tags WHERE name = 'salon_member'`)
          .first<{ id: string }>();
        if (memberTag) {
          await db
            .prepare(`INSERT OR IGNORE INTO friend_tags (friend_id, tag_id, assigned_at) VALUES (?, ?, ?)`)
            .bind(friendId, memberTag.id, now)
            .run();
        }

        // スコアリング
        const { applyScoring } = await import('@line-crm/db');
        await applyScoring(db, friendId, 'purchase');

        // イベントバスに発火
        const { fireEvent } = await import('../services/event-bus.js');
        await fireEvent(db, 'cv_fire', {
          friendId,
          eventData: { type: 'subscription_started', subscriptionId, stripeEventId: body.id },
        });
      }
    }

    // ========== customer.subscription.updated ==========
    if (body.type === 'customer.subscription.updated' && friendId) {
      const status = obj.status;
      const periodEnd = obj.current_period_end
        ? new Date(obj.current_period_end * 1000).toISOString()
        : null;

      // 現在のステータスを取得（遷移検知のため）
      const currentFriend = await db
        .prepare(`SELECT subscription_status, line_user_id FROM friends WHERE id = ?`)
        .bind(friendId)
        .first<{ subscription_status: string | null; line_user_id: string }>();

      // D1ステータスを決定: pause_collection / cancel_at_period_end を考慮
      let resolvedStatus = status ?? null;
      if (obj.pause_collection) {
        resolvedStatus = 'paused';
      } else if (obj.cancel_at_period_end) {
        resolvedStatus = 'cancel_scheduled';
      }

      await db
        .prepare(
          `UPDATE friends SET subscription_status = ?, current_period_end = COALESCE(?, current_period_end), updated_at = ? WHERE id = ?`,
        )
        .bind(resolvedStatus, periodEnd, now, friendId)
        .run();

      // 口座振替の入金完了: incomplete → active に遷移した場合、タグ付け・スコアリングを実行
      if (status === 'active' && !obj.pause_collection && !obj.cancel_at_period_end && currentFriend?.subscription_status === 'incomplete') {
        await addTag(db, friendId, 'salon_member');

        const { applyScoring } = await import('@line-crm/db');
        await applyScoring(db, friendId, 'purchase');

        const { fireEvent } = await import('../services/event-bus.js');
        await fireEvent(db, 'cv_fire', {
          friendId,
          eventData: { type: 'subscription_started', stripeEventId: body.id },
        });
      }
    }

    // ========== customer.subscription.paused ==========
    if (body.type === 'customer.subscription.paused' && friendId) {
      await db
        .prepare(`UPDATE friends SET subscription_status = 'paused', updated_at = ? WHERE id = ?`)
        .bind(now, friendId)
        .run();

      await addTag(db, friendId, 'subscription_paused');

      const friend = await db
        .prepare(`SELECT line_user_id FROM friends WHERE id = ?`)
        .bind(friendId)
        .first<{ line_user_id: string }>();
      if (friend) {
        await sendLineNotification(c.env, friend.line_user_id, `整体卒業サロンのメンバーシップが休会状態になりました。\n\nマイページからいつでも復帰できます。`);
      }
    }

    // ========== customer.subscription.resumed ==========
    if (body.type === 'customer.subscription.resumed' && friendId) {
      await db
        .prepare(`UPDATE friends SET subscription_status = 'active', updated_at = ? WHERE id = ?`)
        .bind(now, friendId)
        .run();

      await removeTag(db, friendId, 'subscription_paused');

      const friend = await db
        .prepare(`SELECT line_user_id FROM friends WHERE id = ?`)
        .bind(friendId)
        .first<{ line_user_id: string }>();
      if (friend) {
        await sendLineNotification(c.env, friend.line_user_id, `整体卒業サロンのメンバーシップが再開されました！\n\n引き続きコンテンツをお楽しみください。`);
      }
    }

    // ========== customer.subscription.deleted ==========
    if (body.type === 'customer.subscription.deleted' && friendId) {
      // ステータスを解約済みに更新
      await db
        .prepare(
          `UPDATE friends SET subscription_status = 'canceled', subscription_id = NULL, current_period_end = NULL, updated_at = ? WHERE id = ?`,
        )
        .bind(now, friendId)
        .run();

      // タグ操作
      await addTag(db, friendId, 'subscription_cancelled');
      await removeTag(db, friendId, 'salon_member');
      await removeTag(db, friendId, 'subscription_paused');

      // イベントバスに発火
      const { fireEvent } = await import('../services/event-bus.js');
      await fireEvent(db, 'cv_fire', {
        friendId,
        eventData: { type: 'subscription_cancelled', stripeEventId: body.id },
      });
    }

    // ========== invoice.payment_failed ==========
    if (body.type === 'invoice.payment_failed' && friendId) {
      // ステータスを支払い失敗に更新
      await db
        .prepare(`UPDATE friends SET subscription_status = 'past_due', updated_at = ? WHERE id = ?`)
        .bind(now, friendId)
        .run();

      // 支払い失敗タグ付け
      const failedTag = await db
        .prepare(`SELECT id FROM tags WHERE name = 'payment_failed'`)
        .first<{ id: string }>();
      if (failedTag) {
        await db
          .prepare(`INSERT OR IGNORE INTO friend_tags (friend_id, tag_id, assigned_at) VALUES (?, ?, ?)`)
          .bind(friendId, failedTag.id, now)
          .run();
      }
    }

    // ========== payment_intent.succeeded (既存の汎用決済成功処理) ==========
    if (body.type === 'payment_intent.succeeded' && friendId) {
      const { applyScoring } = await import('@line-crm/db');
      await applyScoring(db, friendId, 'purchase');

      const productId = obj.metadata?.product_id;
      if (productId) {
        const tag = await db
          .prepare(`SELECT id FROM tags WHERE name = ?`)
          .bind(`purchased_${productId}`)
          .first<{ id: string }>();
        if (tag) {
          await db
            .prepare(`INSERT OR IGNORE INTO friend_tags (friend_id, tag_id, assigned_at) VALUES (?, ?, ?)`)
            .bind(friendId, tag.id, now)
            .run();
        }
      }

      const { fireEvent } = await import('../services/event-bus.js');
      await fireEvent(db, 'cv_fire', {
        friendId,
        eventData: { type: 'purchase', amount: obj.amount, stripeEventId: body.id },
      });
    }

    return c.json({
      success: true,
      data: { id: event.id, stripeEventId: event.stripe_event_id, eventType: event.event_type, processedAt: event.processed_at },
    });
  } catch (err) {
    console.error('POST /api/integrations/stripe/webhook error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 会員マイページ HTML レンダリング ==========

function renderMembershipPage(
  friend: {
    id: string;
    display_name: string | null;
    subscription_status: string | null;
    subscription_id: string | null;
    current_period_end: string | null;
    stripe_customer_id: string | null;
  },
  flashStatus?: string,
): string {
  const isActive = friend.subscription_status === 'active' || friend.subscription_status === 'trialing';
  const isPaused = friend.subscription_status === 'paused';
  const isCancelScheduled = friend.subscription_status === 'cancel_scheduled';
  const isPastDue = friend.subscription_status === 'past_due';
  const isIncomplete = friend.subscription_status === 'incomplete';
  const statusLabel = isActive
    ? 'アクティブ'
    : isPaused
      ? '休会中'
      : isCancelScheduled
        ? '退会予定'
        : isIncomplete
          ? '入金待ち'
          : isPastDue
            ? '支払い未完了'
            : friend.subscription_status === 'canceled'
              ? '解約済み'
              : '未登録';
  const statusColor = isActive ? '#06C755' : isPaused ? '#f59e0b' : isCancelScheduled ? '#ef4444' : isIncomplete ? '#3b82f6' : isPastDue ? '#f59e0b' : '#999';

  const nextBilling = friend.current_period_end
    ? new Date(friend.current_period_end).toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '-';

  const flashHtml = flashStatus === 'success'
    ? `<div class="flash success">お支払いが完了しました！ありがとうございます。</div>`
    : flashStatus === 'cancelled'
      ? `<div class="flash cancelled">お支払いがキャンセルされました。</div>`
      : '';

  const escName = (friend.display_name ?? 'メンバー').replace(/[<>&"']/g, (c) => {
    const map: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
    return map[c] ?? c;
  });

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>整体卒業サロン - マイページ</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Hiragino Sans', 'Yu Gothic', system-ui, sans-serif;
      background: #f5f5f5;
      color: #333;
      display: flex;
      justify-content: center;
      min-height: 100vh;
      padding: 24px 16px;
    }
    .container { max-width: 480px; width: 100%; }
    .flash {
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 16px;
      text-align: center;
    }
    .flash.success { background: #e8faf0; color: #06C755; }
    .flash.cancelled { background: #fef3c7; color: #92400e; }
    .card {
      background: #fff;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      margin-bottom: 16px;
    }
    .header { text-align: center; margin-bottom: 8px; }
    .header h1 { font-size: 20px; color: #333; margin-bottom: 4px; }
    .header .subtitle { font-size: 13px; color: #999; }
    .greeting { font-size: 16px; font-weight: 600; margin-bottom: 16px; text-align: center; }
    .status-badge {
      display: inline-block;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 700;
      color: #fff;
      background: ${statusColor};
      margin-bottom: 16px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #f0f0f0;
      font-size: 14px;
    }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #999; }
    .info-value { font-weight: 600; color: #333; }
    .btn {
      display: block;
      width: 100%;
      padding: 14px;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      text-align: center;
      text-decoration: none;
      transition: opacity 0.15s;
      font-family: inherit;
      margin-bottom: 8px;
    }
    .btn:active { opacity: 0.85; }
    .btn-primary { background: #06C755; color: #fff; }
    .btn-outline { background: #fff; color: #e53e3e; border: 1.5px solid #e53e3e; }
    .btn-secondary { background: #f5f5f5; color: #333; border: 1.5px solid #ddd; }
    .content-list { list-style: none; }
    .content-list li {
      padding: 12px 0;
      border-bottom: 1px solid #f0f0f0;
      font-size: 14px;
    }
    .content-list li:last-child { border-bottom: none; }
    .content-list a { color: #06C755; text-decoration: none; font-weight: 600; }
    .section-title { font-size: 15px; font-weight: 700; margin-bottom: 12px; }
    .price { font-size: 13px; color: #999; text-align: center; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="container">
    ${flashHtml}

    <div class="card header">
      <h1>整体卒業サロン</h1>
      <p class="subtitle">メンバーシップ マイページ</p>
    </div>

    <div class="card" style="text-align: center;">
      <p class="greeting">${escName} さん</p>
      <span class="status-badge">${statusLabel}</span>
      ${isActive || isCancelScheduled ? `
      <div class="info-row">
        <span class="info-label">プラン</span>
        <span class="info-value">月額 2,980円</span>
      </div>
      <div class="info-row">
        <span class="info-label">${isCancelScheduled ? '利用可能期限' : '次回請求日'}</span>
        <span class="info-value">${nextBilling}</span>
      </div>
      ` : ''}
      ${isPaused ? `
      <p style="font-size: 13px; color: #92400e; margin-top: 12px;">
        現在休会中です。課金は停止されています。最大3ヶ月間休会可能です。
      </p>
      ` : ''}
      ${isCancelScheduled ? `
      <p style="font-size: 13px; color: #ef4444; margin-top: 12px;">
        退会予定です。${nextBilling}まで引き続きコンテンツをご利用いただけます。
      </p>
      ` : ''}
      ${isIncomplete ? `
      <p style="font-size: 13px; color: #3b82f6; margin-top: 12px;">
        口座振替でのお支払いをお待ちしております。振込先情報はメールをご確認ください。入金確認後、自動的にアクティブになります。
      </p>
      ` : ''}
      ${isPastDue ? `
      <p style="font-size: 13px; color: #92400e; margin-top: 12px;">
        お支払いに問題があります。下のボタンからお支払い方法を更新してください。
      </p>
      ` : ''}
    </div>

    ${!isActive && !isPastDue && !isPaused && !isCancelScheduled && !isIncomplete ? `
    <div class="card" style="text-align: center;">
      <p class="section-title">サロンに参加する</p>
      <p class="price">月額 2,980円（税込）</p>
      <button class="btn btn-primary" onclick="startCheckout()">メンバーシップに登録する</button>
    </div>
    ` : ''}

    ${isActive || isCancelScheduled ? `
    <div class="card">
      <p class="section-title">コンテンツ一覧</p>
      <ul class="content-list">
        <li><a href="#">セルフケア動画ライブラリ</a></li>
        <li><a href="#">月刊ニュースレター</a></li>
        <li><a href="#">メンバー限定Q&amp;A</a></li>
        <li><a href="#">オンライン相談予約</a></li>
      </ul>
    </div>
    ` : ''}

    ${isActive ? `
    <div class="card" style="text-align: center;">
      <button class="btn btn-secondary" onclick="pauseSubscription()">休会する</button>
      <button class="btn btn-outline" onclick="cancelSubscription()">退会する</button>
    </div>
    ` : ''}

    ${isPaused ? `
    <div class="card" style="text-align: center;">
      <button class="btn btn-primary" onclick="resumeSubscription()">復帰する</button>
      <button class="btn btn-outline" onclick="cancelSubscription()">退会する</button>
    </div>
    ` : ''}

    ${isCancelScheduled ? `
    <div class="card" style="text-align: center;">
      <button class="btn btn-primary" onclick="undoCancel()">退会をキャンセルする</button>
    </div>
    ` : ''}

    ${isPastDue ? `
    <div class="card" style="text-align: center;">
      <button class="btn btn-outline" onclick="openPortal()">お支払い方法を更新する</button>
    </div>
    ` : ''}
  </div>

  <script>
    var FRIEND_ID = '${friend.id}';
    var API_BASE = '${WORKERS_URL}';

    function startCheckout() {
      var btn = event.target;
      btn.disabled = true;
      btn.textContent = '処理中...';
      fetch(API_BASE + '/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendId: FRIEND_ID }),
      })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (data.success && data.data.url) {
            window.location.href = data.data.url;
          } else {
            alert(data.error || 'エラーが発生しました');
            btn.disabled = false;
            btn.textContent = 'メンバーシップに登録する';
          }
        })
        .catch(function() {
          alert('通信エラーが発生しました');
          btn.disabled = false;
          btn.textContent = 'メンバーシップに登録する';
        });
    }

    function openPortal() {
      var btn = event.target;
      btn.disabled = true;
      btn.textContent = '処理中...';
      fetch(API_BASE + '/api/membership/' + FRIEND_ID + '/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (data.success && data.data.url) {
            window.location.href = data.data.url;
          } else {
            alert(data.error || 'エラーが発生しました');
            btn.disabled = false;
            btn.textContent = 'お支払い方法を更新する';
          }
        })
        .catch(function() {
          alert('通信エラーが発生しました');
          btn.disabled = false;
          btn.textContent = 'お支払い方法を更新する';
        });
    }

    function membershipAction(path, btn, originalText, confirmMsg) {
      if (confirmMsg && !confirm(confirmMsg)) return;
      btn.disabled = true;
      btn.textContent = '処理中...';
      fetch(API_BASE + '/api/membership/' + FRIEND_ID + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (data.success) {
            location.reload();
          } else {
            alert(data.error || 'エラーが発生しました');
            btn.disabled = false;
            btn.textContent = originalText;
          }
        })
        .catch(function() {
          alert('通信エラーが発生しました');
          btn.disabled = false;
          btn.textContent = originalText;
        });
    }

    function pauseSubscription() {
      membershipAction('/pause', event.target, '休会する', '休会しますか？\\n\\n課金が停止されます。最大3ヶ月間休会可能で、いつでも復帰できます。');
    }

    function resumeSubscription() {
      membershipAction('/resume', event.target, '復帰する', null);
    }

    function cancelSubscription() {
      membershipAction('/cancel', event.target, '退会する', '退会しますか？\\n\\n現在の請求期間末まで引き続きご利用いただけます。');
    }

    function undoCancel() {
      var btn = event.target;
      btn.disabled = true;
      btn.textContent = '処理中...';
      fetch(API_BASE + '/api/membership/' + FRIEND_ID + '/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ undo: true }),
      })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (data.success) {
            location.reload();
          } else {
            alert(data.error || 'エラーが発生しました');
            btn.disabled = false;
            btn.textContent = '退会をキャンセルする';
          }
        })
        .catch(function() {
          alert('通信エラーが発生しました');
          btn.disabled = false;
          btn.textContent = '退会をキャンセルする';
        });
    }
  </script>
</body>
</html>`;
}

export { stripe };
