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
    const workersUrl = new URL(c.req.url).origin;
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
      'success_url': `${workersUrl}/api/membership/${friend.id}?status=success`,
      'cancel_url': `${workersUrl}/api/membership/${friend.id}?status=cancelled`,
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
      .prepare(`SELECT id, display_name, picture_url, subscription_status, subscription_id, current_period_end, stripe_customer_id FROM friends WHERE id = ?`)
      .bind(friendId)
      .first<{
        id: string;
        display_name: string | null;
        picture_url: string | null;
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
      const apiBase = new URL(c.req.url).origin;
      const liffId = (c.env as unknown as Record<string, string | undefined>).LIFF_ID;
      return c.html(renderMembershipPage(friend, status ?? undefined, apiBase, liffId ?? undefined));
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
    const workersUrl = new URL(c.req.url).origin;
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
      return_url: `${workersUrl}/api/membership/${friendId}`,
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

const DEFAULT_LIFF_ID_MYPAGE = '2009595752-X90IWgrz';

function renderMembershipPage(
  friend: {
    id: string;
    display_name: string | null;
    picture_url: string | null;
    subscription_status: string | null;
    subscription_id: string | null;
    current_period_end: string | null;
    stripe_customer_id: string | null;
  },
  flashStatus?: string,
  apiBaseUrl?: string,
  liffId?: string,
): string {
  const escName = (friend.display_name ?? 'メンバー').replace(/[<>&"']/g, (ch) => {
    const map: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
    return map[ch] ?? ch;
  });

  // Server-side data injected into the SPA
  const initData = JSON.stringify({
    friendId: friend.id,
    displayName: friend.display_name,
    pictureUrl: friend.picture_url,
    subscriptionStatus: friend.subscription_status,
    subscriptionId: friend.subscription_id,
    currentPeriodEnd: friend.current_period_end,
    stripeCustomerId: friend.stripe_customer_id,
    flashStatus: flashStatus ?? null,
  }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>整体卒業サロン - マイページ</title>
  <script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <style>
    :root { --green: #1a6b5a; --green-light: #e8f5f0; --gold: #d4a853; --gold-light: #faf3e0; --bg: #f7f7f5; --card: #fff; --text: #333; --text-sub: #888; --border: #eee; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Hiragino Sans', 'Yu Gothic', system-ui, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; padding-bottom: 72px; }
    .header-bar { background: var(--green); color: #fff; padding: 20px 16px 16px; }
    .header-profile { display: flex; align-items: center; gap: 12px; }
    .header-profile img { width: 44px; height: 44px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.3); }
    .header-profile .name { font-size: 16px; font-weight: 700; }
    .header-profile .sub { font-size: 12px; opacity: 0.8; }
    .tabs { display: flex; background: var(--card); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 10; }
    .tab { flex: 1; text-align: center; padding: 12px 0; font-size: 13px; font-weight: 600; color: var(--text-sub); cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; }
    .tab.active { color: var(--green); border-bottom-color: var(--green); }
    .tab-content { display: none; padding: 16px; }
    .tab-content.active { display: block; }
    .card { background: var(--card); border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); margin-bottom: 12px; }
    .status-badge { display: inline-block; padding: 4px 14px; border-radius: 16px; font-size: 12px; font-weight: 700; color: #fff; }
    .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: var(--text-sub); }
    .info-value { font-weight: 600; }
    .btn { display: block; width: 100%; padding: 13px; border: none; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; text-align: center; transition: opacity 0.15s; font-family: inherit; margin-bottom: 8px; }
    .btn:active { opacity: 0.85; }
    .btn-green { background: var(--green); color: #fff; }
    .btn-gold { background: var(--gold); color: #fff; }
    .btn-outline { background: var(--card); color: #e53e3e; border: 1.5px solid #e53e3e; }
    .btn-secondary { background: #f0f0f0; color: var(--text); }
    .section-title { font-size: 14px; font-weight: 700; color: var(--green); margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
    .flash { padding: 10px 16px; border-radius: 10px; font-size: 13px; font-weight: 600; margin: 16px 16px 0; text-align: center; }
    .flash.success { background: var(--green-light); color: var(--green); }
    .flash.cancelled { background: #fef3c7; color: #92400e; }
    .category-pills { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 12px; -webkit-overflow-scrolling: touch; }
    .category-pills::-webkit-scrollbar { display: none; }
    .pill { flex-shrink: 0; padding: 6px 14px; border-radius: 16px; font-size: 12px; font-weight: 600; background: #f0f0f0; color: var(--text-sub); cursor: pointer; border: none; }
    .pill.active { background: var(--green); color: #fff; }
    .content-card { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); cursor: pointer; }
    .content-card:last-child { border-bottom: none; }
    .content-thumb { width: 100px; height: 64px; border-radius: 8px; background: #e0e0e0; object-fit: cover; flex-shrink: 0; }
    .content-info { flex: 1; min-width: 0; }
    .content-title { font-size: 13px; font-weight: 600; margin-bottom: 4px; line-height: 1.4; }
    .content-meta { font-size: 11px; color: var(--text-sub); }
    .content-lock { position: relative; }
    .content-lock::after { content: ''; position: absolute; inset: 0; background: rgba(255,255,255,0.7); border-radius: 8px; display: flex; align-items: center; justify-content: center; }
    .schedule-card { padding: 12px 0; border-bottom: 1px solid var(--border); }
    .schedule-card:last-child { border-bottom: none; }
    .schedule-date { font-size: 12px; color: var(--gold); font-weight: 700; margin-bottom: 4px; }
    .schedule-title { font-size: 14px; font-weight: 600; }
    .schedule-desc { font-size: 12px; color: var(--text-sub); margin-top: 2px; }
    .invoice-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
    .invoice-row:last-child { border-bottom: none; }
    .invoice-amount { font-weight: 700; }
    .invoice-link { color: var(--green); text-decoration: none; font-size: 12px; font-weight: 600; }
    .form-group { margin-bottom: 16px; }
    .form-label { display: block; font-size: 12px; font-weight: 600; color: var(--text-sub); margin-bottom: 6px; }
    .form-input { width: 100%; padding: 10px 12px; border: 1.5px solid var(--border); border-radius: 8px; font-size: 14px; font-family: inherit; outline: none; transition: border-color 0.2s; }
    .form-input:focus { border-color: var(--green); }
    .empty { text-align: center; padding: 32px 16px; color: var(--text-sub); font-size: 13px; }
    .loading { text-align: center; padding: 24px; color: var(--text-sub); font-size: 13px; }
    .video-modal { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,0.85); display: none; flex-direction: column; }
    .video-modal.show { display: flex; }
    .video-modal-close { color: #fff; font-size: 28px; padding: 12px 16px; cursor: pointer; text-align: right; }
    .video-modal iframe { flex: 1; width: 100%; border: none; }
  </style>
</head>
<body>
  <!-- Flash message -->
  <div id="flash"></div>

  <!-- Header with LINE profile -->
  <div class="header-bar">
    <div class="header-profile">
      <img id="profileImg" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44'%3E%3Crect fill='%23ccc' width='44' height='44' rx='22'/%3E%3C/svg%3E" alt="">
      <div>
        <div class="name" id="profileName">${escName}</div>
        <div class="sub">整体卒業サロン</div>
      </div>
    </div>
  </div>

  <!-- Tab Navigation -->
  <div class="tabs">
    <div class="tab active" data-tab="home">ホーム</div>
    <div class="tab" data-tab="content">コンテンツ</div>
    <div class="tab" data-tab="settings">設定</div>
  </div>

  <!-- ===== HOME TAB ===== -->
  <div class="tab-content active" id="tab-home">
    <div class="card" id="statusCard"></div>
    <div class="card" id="scheduleCard"><p class="section-title">&#x1f4c5; 次回Live配信</p><p class="loading">読み込み中...</p></div>
    <div class="card" id="newsCard"><p class="section-title">&#x2728; 新着コンテンツ</p><p class="loading">読み込み中...</p></div>
  </div>

  <!-- ===== CONTENT TAB ===== -->
  <div class="tab-content" id="tab-content">
    <div class="category-pills" id="categoryPills"></div>
    <div class="card" id="contentList"><p class="loading">読み込み中...</p></div>
  </div>

  <!-- ===== SETTINGS TAB ===== -->
  <div class="tab-content" id="tab-settings">
    <div class="card" id="profileForm"></div>
    <div class="card" id="planInfo"></div>
    <div class="card" id="invoiceList"><p class="section-title">&#x1f4b3; 支払い履歴</p><p class="loading">読み込み中...</p></div>
    <div class="card" id="accountActions"></div>
  </div>

  <!-- Video modal -->
  <div class="video-modal" id="videoModal">
    <div class="video-modal-close" onclick="closeVideo()">&times;</div>
    <iframe id="videoFrame" allow="autoplay; fullscreen" allowfullscreen></iframe>
  </div>

  <script>
    var INIT = ${initData};
    var API = '${(apiBaseUrl ?? '').replace(/'/g, "\\'")}';
    var FID = INIT.friendId;

    // Set profile from DB data immediately
    if (INIT.pictureUrl) document.getElementById('profileImg').src = INIT.pictureUrl;

    // LIFF Init — override with fresh LINE profile if available
    try {
      liff.init({ liffId: '${(liffId ?? DEFAULT_LIFF_ID_MYPAGE).replace(/'/g, "\\'")}' }).then(function() {
        if (liff.isLoggedIn()) {
          liff.getProfile().then(function(p) {
            document.getElementById('profileName').textContent = p.displayName;
            if (p.pictureUrl) document.getElementById('profileImg').src = p.pictureUrl;
          }).catch(function(){});
        }
      }).catch(function(e) { console.warn('LIFF init failed:', e); });
    } catch(e) { console.warn('LIFF SDK not available:', e); }

    // Flash
    if (INIT.flashStatus === 'success') {
      document.getElementById('flash').innerHTML = '<div class="flash success">お支払いが完了しました！</div>';
    } else if (INIT.flashStatus === 'cancelled') {
      document.getElementById('flash').innerHTML = '<div class="flash cancelled">お支払いがキャンセルされました。</div>';
    }

    // Tabs
    document.querySelectorAll('.tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
        document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
        if (tab.dataset.tab === 'content' && !contentLoaded) loadContent();
        if (tab.dataset.tab === 'settings' && !settingsLoaded) loadSettings();
      });
    });

    // Status helpers
    var STATUS_MAP = {
      active: { label: 'アクティブ', color: '#1a6b5a' },
      trialing: { label: 'アクティブ', color: '#1a6b5a' },
      paused: { label: '休会中', color: '#d4a853' },
      cancel_scheduled: { label: '退会予定', color: '#ef4444' },
      incomplete: { label: '入金待ち', color: '#3b82f6' },
      past_due: { label: '支払い未完了', color: '#f59e0b' },
      canceled: { label: '解約済み', color: '#999' }
    };
    function isMember(s) { return s === 'active' || s === 'trialing' || s === 'paused' || s === 'cancel_scheduled'; }
    function fmtDate(iso) { if (!iso) return '-'; return new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }); }
    function fmtDuration(sec) { if (!sec) return ''; var m = Math.floor(sec / 60), s2 = sec % 60; return m + ':' + (s2 < 10 ? '0' : '') + s2; }
    function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

    // HOME: Status Card
    (function() {
      var s = INIT.subscriptionStatus || 'none';
      var info = STATUS_MAP[s] || { label: '未登録', color: '#999' };
      var h = '<div style="text-align:center"><span class="status-badge" style="background:' + info.color + '">' + info.label + '</span>';
      if (s === 'active' || s === 'trialing' || s === 'cancel_scheduled') {
        h += '<div class="info-row"><span class="info-label">プラン</span><span class="info-value">月額 2,980円</span></div>';
        h += '<div class="info-row"><span class="info-label">' + (s === 'cancel_scheduled' ? '利用可能期限' : '次回請求日') + '</span><span class="info-value">' + fmtDate(INIT.currentPeriodEnd) + '</span></div>';
      }
      if (s === 'paused') h += '<p style="font-size:12px;color:#92400e;margin-top:10px">現在休会中です。課金は停止されています。</p>';
      if (s === 'cancel_scheduled') h += '<p style="font-size:12px;color:#ef4444;margin-top:10px">退会予定です。' + fmtDate(INIT.currentPeriodEnd) + 'まで利用できます。</p>';
      if (s === 'incomplete') h += '<p style="font-size:12px;color:#3b82f6;margin-top:10px">口座振替でのお支払いをお待ちしております。</p>';
      if (s === 'past_due') h += '<p style="font-size:12px;color:#92400e;margin-top:10px">お支払いに問題があります。</p>';
      if (!isMember(s) && s !== 'incomplete' && s !== 'past_due') {
        h += '<div style="margin-top:16px"><p style="font-size:13px;color:var(--text-sub);margin-bottom:12px">月額 2,980円（税込）</p>';
        h += '<button class="btn btn-green" onclick="startCheckout()">メンバーシップに登録する</button></div>';
      }
      h += '</div>';
      document.getElementById('statusCard').innerHTML = h;
    })();

    // HOME: Schedule
    fetch(API + '/api/membership/' + FID + '/schedule').then(function(r) { return r.json(); }).then(function(res) {
      var el = document.getElementById('scheduleCard');
      if (!res.success || !res.data || res.data.length === 0) { el.innerHTML = '<p class="section-title">&#x1f4c5; 次回Live配信</p><p class="empty">現在予定はありません</p>'; return; }
      var h = '<p class="section-title">&#x1f4c5; 次回Live配信</p>';
      res.data.slice(0, 3).forEach(function(s) { h += '<div class="schedule-card"><div class="schedule-date">' + fmtDate(s.scheduledAt) + '</div><div class="schedule-title">' + esc(s.title) + '</div>' + (s.description ? '<div class="schedule-desc">' + esc(s.description) + '</div>' : '') + '</div>'; });
      el.innerHTML = h;
    }).catch(function() { document.getElementById('scheduleCard').innerHTML = '<p class="section-title">&#x1f4c5; 次回Live配信</p><p class="empty">読み込み失敗</p>'; });

    // HOME: Latest content
    var allContent = [], contentIsMember = false, contentLoaded = false, selectedCat = 'all';
    fetch(API + '/api/membership/' + FID + '/content').then(function(r) { return r.json(); }).then(function(res) {
      var el = document.getElementById('newsCard');
      if (!res.success || !res.data.items || res.data.items.length === 0) { el.innerHTML = '<p class="section-title">&#x2728; 新着コンテンツ</p><p class="empty">コンテンツはまだありません</p>'; return; }
      allContent = res.data.items; contentIsMember = res.data.isMember;
      var h = '<p class="section-title">&#x2728; 新着コンテンツ</p>';
      res.data.items.slice(0, 3).forEach(function(c) { h += mkCard(c, res.data.isMember); });
      el.innerHTML = h;
    }).catch(function() { document.getElementById('newsCard').innerHTML = '<p class="section-title">&#x2728; 新着コンテンツ</p><p class="empty">読み込み失敗</p>'; });

    // CONTENT TAB
    var CATS = [{key:'all',label:'すべて'},{key:'neck_shoulder',label:'首・肩'},{key:'back_chest',label:'背中・胸'},{key:'pelvis_waist',label:'骨盤・腰'},{key:'morning_routine',label:'朝ルーティン'},{key:'archive',label:'Liveアーカイブ'}];
    var CAT_LABELS = {neck_shoulder:'首・肩',back_chest:'背中・胸',pelvis_waist:'骨盤・腰',morning_routine:'朝ルーティン',archive:'Liveアーカイブ'};

    function mkCard(c, member) {
      var locked = !member;
      return '<div class="content-card' + (locked ? ' content-lock' : '') + '" onclick="' + (locked ? '' : "openVideo('" + esc(c.videoUrl || '').replace(/'/g,'') + "')") + '">' +
        '<img class="content-thumb" src="' + esc(c.thumbnailUrl || '') + '" alt="" onerror="this.style.background=&quot;#e0e0e0&quot;">' +
        '<div class="content-info"><div class="content-title">' + esc(c.title) + '</div>' +
        '<div class="content-meta">' + (CAT_LABELS[c.category]||c.category) + (c.duration ? ' ・ ' + fmtDuration(c.duration) : '') + '</div></div></div>';
    }

    function renderPills() {
      var h = ''; CATS.forEach(function(c) { h += '<button class="pill' + (c.key === selectedCat ? ' active' : '') + "\" onclick=\"filterCat('" + c.key + "')\">" + c.label + '</button>'; });
      document.getElementById('categoryPills').innerHTML = h;
    }
    function filterCat(cat) { selectedCat = cat; renderPills(); renderCL(); }
    function renderCL() {
      var items = selectedCat === 'all' ? allContent : allContent.filter(function(c){return c.category===selectedCat;});
      var el = document.getElementById('contentList');
      if (!items.length) { el.innerHTML = '<p class="empty">コンテンツはまだありません</p>'; return; }
      var h = '';
      if (!contentIsMember) h += '<div style="text-align:center;padding:12px;margin-bottom:12px;background:var(--gold-light);border-radius:10px"><p style="font-size:13px;font-weight:600;color:var(--gold)">メンバー限定コンテンツです</p><button class="btn btn-gold" style="margin-top:8px" onclick="startCheckout()">メンバーになる</button></div>';
      items.forEach(function(c){h+=mkCard(c,contentIsMember);}); el.innerHTML = h;
    }
    function loadContent() { contentLoaded = true; renderPills(); if (allContent.length) { renderCL(); return; }
      fetch(API+'/api/membership/'+FID+'/content').then(function(r){return r.json();}).then(function(res){ if(res.success){allContent=res.data.items;contentIsMember=res.data.isMember;} renderCL(); }).catch(function(){document.getElementById('contentList').innerHTML='<p class="empty">読み込み失敗</p>';});
    }

    // Video Player
    function openVideo(url) { if(!url)return; var embed=url; var yt=url.match(/(?:youtube\\.com\\/watch\\?v=|youtu\\.be\\/)([^&]+)/); if(yt)embed='https://www.youtube.com/embed/'+yt[1]+'?autoplay=1'; var vm=url.match(/vimeo\\.com\\/(\\d+)/); if(vm)embed='https://player.vimeo.com/video/'+vm[1]+'?autoplay=1'; document.getElementById('videoFrame').src=embed; document.getElementById('videoModal').classList.add('show'); }
    function closeVideo() { document.getElementById('videoFrame').src=''; document.getElementById('videoModal').classList.remove('show'); }

    // SETTINGS TAB
    var settingsLoaded = false;
    function loadSettings() { settingsLoaded = true; renderProfileForm(); renderPlanInfo(); renderAccActions(); loadInvoices(); }

    function renderProfileForm() {
      var h = '<p class="section-title">&#x1f464; プロフィール</p>';
      h += '<div class="form-group"><label class="form-label">表示名</label><input class="form-input" id="pName" value="' + esc(INIT.displayName || '') + '"></div>';
      h += '<div class="form-group"><label class="form-label">目標</label><input class="form-input" id="pGoal" placeholder="例: 肩こりを改善したい"></div>';
      h += '<div class="form-group"><label class="form-label">気になる部位</label><input class="form-input" id="pParts" placeholder="例: 首、腰"></div>';
      h += '<button class="btn btn-green" onclick="saveProfile()">保存する</button>';
      document.getElementById('profileForm').innerHTML = h;
    }
    function saveProfile() {
      var btn = event.target; btn.disabled = true; btn.textContent = '保存中...';
      fetch(API+'/api/membership/'+FID+'/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({displayName:document.getElementById('pName').value,goal:document.getElementById('pGoal').value,bodyParts:document.getElementById('pParts').value})})
        .then(function(r){return r.json();}).then(function(d){btn.disabled=false;btn.textContent=d.success?'保存しました！':'保存する';setTimeout(function(){btn.textContent='保存する';},2000);}).catch(function(){btn.disabled=false;btn.textContent='保存する';alert('通信エラー');});
    }
    function renderPlanInfo() {
      var s = INIT.subscriptionStatus || 'none', info = STATUS_MAP[s] || {label:'未登録',color:'#999'};
      var h = '<p class="section-title">&#x1f4cb; プラン情報</p>';
      h += '<div class="info-row"><span class="info-label">ステータス</span><span class="info-value" style="color:'+info.color+'">'+info.label+'</span></div>';
      if (isMember(s) || s === 'past_due') { h += '<div class="info-row"><span class="info-label">プラン</span><span class="info-value">月額 2,980円</span></div>'; h += '<div class="info-row"><span class="info-label">次回請求日</span><span class="info-value">'+fmtDate(INIT.currentPeriodEnd)+'</span></div>'; }
      h += '<button class="btn btn-secondary" style="margin-top:12px" onclick="openPortal()">お支払い方法を変更する</button>';
      document.getElementById('planInfo').innerHTML = h;
    }
    function loadInvoices() {
      fetch(API+'/api/membership/'+FID+'/invoices').then(function(r){return r.json();}).then(function(res){
        var el = document.getElementById('invoiceList');
        if (!res.success||!res.data||!res.data.length) { el.innerHTML='<p class="section-title">&#x1f4b3; 支払い履歴</p><p class="empty">支払い履歴はありません</p>'; return; }
        var h='<p class="section-title">&#x1f4b3; 支払い履歴</p>';
        res.data.forEach(function(inv){ h+='<div class="invoice-row"><div><div style="font-weight:600">'+fmtDate(inv.createdAt)+'</div></div><div style="display:flex;align-items:center;gap:10px"><span class="invoice-amount">&yen;'+(inv.amount/100).toLocaleString()+'</span>'+(inv.receiptUrl?'<a class="invoice-link" href="'+inv.receiptUrl+'" target="_blank">領収書</a>':'')+'</div></div>'; });
        el.innerHTML = h;
      }).catch(function(){document.getElementById('invoiceList').innerHTML='<p class="section-title">&#x1f4b3; 支払い履歴</p><p class="empty">読み込み失敗</p>';});
    }
    function renderAccActions() {
      var s = INIT.subscriptionStatus, h = '<p class="section-title">&#x2699;&#xfe0f; アカウント管理</p>';
      if (s==='active') { h+='<button class="btn btn-secondary" onclick="pauseSub()">休会する</button><button class="btn btn-outline" onclick="cancelSub()">退会する</button>'; }
      else if (s==='paused') { h+='<button class="btn btn-green" onclick="resumeSub()">復帰する</button><button class="btn btn-outline" onclick="cancelSub()">退会する</button>'; }
      else if (s==='cancel_scheduled') { h+='<button class="btn btn-green" onclick="undoCancel()">退会をキャンセルする</button>'; }
      else if (s==='past_due') { h+='<button class="btn btn-secondary" onclick="openPortal()">お支払い方法を更新する</button>'; }
      document.getElementById('accountActions').innerHTML = h;
    }

    // Actions
    function apiPost(path, body) { return fetch(API+'/api/membership/'+FID+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})}).then(function(r){return r.json();}); }
    function startCheckout() { var btn=event.target;btn.disabled=true;btn.textContent='処理中...'; fetch(API+'/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({friendId:FID})}).then(function(r){return r.json();}).then(function(d){if(d.success&&d.data.url)window.location.href=d.data.url;else{alert(d.error||'エラー');btn.disabled=false;btn.textContent='メンバーシップに登録する';}}).catch(function(){alert('通信エラー');btn.disabled=false;btn.textContent='メンバーシップに登録する';}); }
    function openPortal() { var btn=event.target;btn.disabled=true;btn.textContent='処理中...'; apiPost('/portal').then(function(d){if(d.success&&d.data.url)window.location.href=d.data.url;else{alert(d.error||'エラー');btn.disabled=false;btn.textContent='お支払い方法を変更する';}}).catch(function(){alert('通信エラー');btn.disabled=false;btn.textContent='お支払い方法を変更する';}); }
    function doAction(path,btn,label,msg){if(msg&&!confirm(msg))return;btn.disabled=true;btn.textContent='処理中...';apiPost(path).then(function(d){if(d.success)location.reload();else{alert(d.error||'エラー');btn.disabled=false;btn.textContent=label;}}).catch(function(){alert('通信エラー');btn.disabled=false;btn.textContent=label;});}
    function pauseSub(){doAction('/pause',event.target,'休会する','休会しますか？\\n課金が停止されます。最大3ヶ月間休会可能です。');}
    function resumeSub(){doAction('/resume',event.target,'復帰する',null);}
    function cancelSub(){doAction('/cancel',event.target,'退会する','退会しますか？\\n現在の請求期間末まで利用できます。');}
    function undoCancel(){var btn=event.target;btn.disabled=true;btn.textContent='処理中...';fetch(API+'/api/membership/'+FID+'/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({undo:true})}).then(function(r){return r.json();}).then(function(d){if(d.success)location.reload();else{alert(d.error||'エラー');btn.disabled=false;btn.textContent='退会をキャンセルする';}}).catch(function(){alert('通信エラー');btn.disabled=false;btn.textContent='退会をキャンセルする';});}
  </script>
</body>
</html>`;
}

export { stripe };
