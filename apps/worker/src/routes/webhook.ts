import { Hono } from 'hono';
import { verifySignature, LineClient } from '@line-crm/line-sdk';
import type { WebhookRequestBody, WebhookEvent, TextEventMessage } from '@line-crm/line-sdk';
import {
  upsertFriend,
  updateFriendFollowStatus,
  getFriendByLineUserId,
  getScenarios,
  enrollFriendInScenario,
  getScenarioSteps,
  advanceFriendScenario,
  completeFriendScenario,
  upsertChatOnMessage,
  jstNow,
} from '@line-crm/db';
import { fireEvent } from '../services/event-bus.js';
import { buildMessage } from '../services/step-delivery.js';
import { startSequence, stopSequence, resumeSequence } from '../services/sequence-delivery.js';
import { autoAddTag, autoRemoveTag, getSourceTagId } from '../services/auto-tagging.js';
import { notifyNewFriend, notifyUnmatchedMessage } from '../services/email-notification.js';
import type { Env } from '../index.js';

const webhook = new Hono<Env>();

webhook.post('/webhook', async (c) => {
  const channelSecret = c.env.LINE_CHANNEL_SECRET;
  const signature = c.req.header('X-Line-Signature') ?? '';
  const rawBody = await c.req.text();

  // Always return 200 to LINE, but verify signature first
  const valid = await verifySignature(channelSecret, rawBody, signature);
  if (!valid) {
    console.error('Invalid LINE signature');
    return c.json({ status: 'ok' }, 200);
  }

  let body: WebhookRequestBody;
  try {
    body = JSON.parse(rawBody) as WebhookRequestBody;
  } catch {
    console.error('Failed to parse webhook body');
    return c.json({ status: 'ok' }, 200);
  }

  const db = c.env.DB;
  const lineClient = new LineClient(c.env.LINE_CHANNEL_ACCESS_TOKEN);

  // 非同期処理 — LINE は ~1s 以内のレスポンスを要求
  const lineAccessToken = c.env.LINE_CHANNEL_ACCESS_TOKEN;
  const processingPromise = (async () => {
    for (const event of body.events) {
      try {
        await handleEvent(db, lineClient, event, lineAccessToken, { DB: c.env.DB, LINE_CHANNEL_ACCESS_TOKEN: c.env.LINE_CHANNEL_ACCESS_TOKEN, RESEND_API_KEY: (c.env as unknown as Record<string, string | undefined>).RESEND_API_KEY });
      } catch (err) {
        console.error('Error handling webhook event:', err);
      }
    }
  })();

  c.executionCtx.waitUntil(processingPromise);

  return c.json({ status: 'ok' }, 200);
});

async function handleEvent(
  db: D1Database,
  lineClient: LineClient,
  event: WebhookEvent,
  lineAccessToken: string,
  env: { DB: D1Database; LINE_CHANNEL_ACCESS_TOKEN: string; RESEND_API_KEY?: string },
): Promise<void> {
  if (event.type === 'follow') {
    const userId =
      event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    // プロフィール取得 & 友だち登録/更新
    let profile;
    try {
      profile = await lineClient.getProfile(userId);
    } catch (err) {
      console.error('Failed to get profile for', userId, err);
    }

    const friend = await upsertFriend(db, {
      lineUserId: userId,
      displayName: profile?.displayName ?? null,
      pictureUrl: profile?.pictureUrl ?? null,
      statusMessage: profile?.statusMessage ?? null,
    });

    // friend_add シナリオに登録
    const scenarios = await getScenarios(db);
    for (const scenario of scenarios) {
      if (scenario.trigger_type === 'friend_add' && scenario.is_active) {
        try {
          const existing = await db
            .prepare(`SELECT id FROM friend_scenarios WHERE friend_id = ? AND scenario_id = ?`)
            .bind(friend.id, scenario.id)
            .first<{ id: string }>();
          if (!existing) {
            const friendScenario = await enrollFriendInScenario(db, friend.id, scenario.id);

            // Immediate delivery: if the first step has delay=0, send it now
            // instead of waiting for the next cron run (up to 5 minutes)
            // NOTE: Uses pushMessage (not replyMessage) because replyToken can only be used once
            // and may be needed for competing immediate deliveries. Future optimization could
            // prioritize reply if available and only one step is due immediately.
            const steps = await getScenarioSteps(db, scenario.id);
            const firstStep = steps[0];
            if (firstStep && firstStep.delay_minutes === 0 && friendScenario.status === 'active') {
              try {
                const message = buildMessage(firstStep.message_type, firstStep.message_content);
                await lineClient.pushMessage(userId, [message]);
                console.log(`Immediate delivery: sent step ${firstStep.id} to ${userId}`);

                // Log outgoing message
                const logId = crypto.randomUUID();
                await db
                  .prepare(
                    `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, created_at)
                     VALUES (?, ?, 'outgoing', ?, ?, NULL, ?, ?)`,
                  )
                  .bind(logId, friend.id, firstStep.message_type, firstStep.message_content, firstStep.id, jstNow())
                  .run();

                // Advance or complete the friend_scenario
                const secondStep = steps[1] ?? null;
                if (secondStep) {
                  const nextDeliveryDate = new Date(Date.now() + 9 * 60 * 60_000);
                  nextDeliveryDate.setMinutes(nextDeliveryDate.getMinutes() + secondStep.delay_minutes);
                  await advanceFriendScenario(db, friendScenario.id, firstStep.step_order, nextDeliveryDate.toISOString().slice(0, -1) + '+09:00');
                } else {
                  await completeFriendScenario(db, friendScenario.id);
                }
              } catch (err) {
                console.error('Failed immediate delivery for scenario', scenario.id, err);
              }
            }
          }
        } catch (err) {
          console.error('Failed to enroll friend in scenario', scenario.id, err);
        }
      }
    }

    // ウェルカムメッセージ送信（replyMessageで無料送信）
    try {
      const replyToken = (event as { replyToken?: string }).replyToken;
      if (replyToken) {
        await lineClient.replyMessage(replyToken, [{
          type: 'text',
          text: `🎉 友だち追加ありがとうございます！

「整体卒業サロン」は、体の不調を自分で解消できるようになるオンラインサロンです。

🔑 サロンでできること：
・セルフケア動画で毎日5分の習慣づくり
・月2回のLive配信で直接アドバイス
・メンバー同士のコミュニティ
・7日間整体卒業チャレンジ

まずは下のメニューから「マイページ」をタップして、サロンの詳細をご覧ください👇`,
        }]);
      } else {
        // replyTokenが無い場合はpushMessageでフォールバック
        await lineClient.pushMessage(userId, [{
          type: 'text',
          text: `🎉 友だち追加ありがとうございます！

「整体卒業サロン」は、体の不調を自分で解消できるようになるオンラインサロンです。

🔑 サロンでできること：
・セルフケア動画で毎日5分の習慣づくり
・月2回のLive配信で直接アドバイス
・メンバー同士のコミュニティ
・7日間整体卒業チャレンジ

まずは下のメニューから「マイページ」をタップして、サロンの詳細をご覧ください👇`,
        }]);
      }
    } catch (err) {
      console.error('Failed to send welcome message:', err);
    }

    // 流入経路マッチング & ソースタグ付与
    try {
      await matchTrackingSource(db, userId);
      // source特定後にタグ付与
      const friendSource = await db
        .prepare('SELECT source FROM friends WHERE line_user_id = ?')
        .bind(userId)
        .first<{ source: string | null }>();
      const sourceTagId = getSourceTagId(friendSource?.source || 'direct');
      await autoAddTag(db, friend.id, sourceTagId);
    } catch (err) {
      console.error('Failed to match tracking source for', userId, err);
    }

    // 7日間チャレンジ シーケンス開始
    try {
      await startSequence(db, lineClient, userId);
    } catch (err) {
      console.error('Failed to start sequence for', userId, err);
    }

    // メール通知: 新規友だち追加
    if (env.RESEND_API_KEY) {
      try {
        const src = await db.prepare('SELECT source FROM friends WHERE line_user_id = ?').bind(userId).first<{ source: string | null }>();
        await notifyNewFriend(env.RESEND_API_KEY, profile?.displayName ?? null, src?.source ?? null);
      } catch (e) { console.error('Email notify (new friend) failed:', e); }
    }

    // イベントバス発火: friend_add
    await fireEvent(db, 'friend_add', { friendId: friend.id, eventData: { displayName: friend.display_name } }, lineAccessToken);
    return;
  }

  if (event.type === 'unfollow') {
    const userId =
      event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    await updateFriendFollowStatus(db, userId, false);
    return;
  }

  if (event.type === 'message' && event.message.type === 'text') {
    const textMessage = event.message as TextEventMessage;
    const userId =
      event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    const friend = await getFriendByLineUserId(db, userId);
    if (!friend) return;

    const incomingText = textMessage.text;
    const now = jstNow();
    const logId = crypto.randomUUID();

    // ステップ配信の停止/再開コマンド
    if (incomingText.trim() === '停止') {
      const stopped = await stopSequence(db, userId);
      if (stopped) {
        try {
          await lineClient.pushMessage(userId, [{
            type: 'text',
            text: 'チャレンジの配信を停止しました。\n再開をご希望の場合は「再開」とメッセージしてください。',
          }]);
        } catch (err) {
          console.error('Failed to send stop confirmation:', err);
        }
        // タグ自動付与: 配信停止
        try {
          await autoAddTag(db, friend.id, 'tag-challenge-stopped');
        } catch (err) {
          console.error('Failed to add challenge-stopped tag:', err);
        }
      }
    }

    if (incomingText.trim() === '再開') {
      const resumed = await resumeSequence(db, userId);
      if (resumed) {
        try {
          await lineClient.pushMessage(userId, [{
            type: 'text',
            text: 'チャレンジの配信を再開しました！\n次の配信は今晩20時にお届けします💪',
          }]);
        } catch (err) {
          console.error('Failed to send resume confirmation:', err);
        }
        // タグ自動削除: 配信停止タグを外す
        try {
          await autoRemoveTag(db, friend.id, 'tag-challenge-stopped');
        } catch (err) {
          console.error('Failed to remove challenge-stopped tag:', err);
        }
      }
    }

    // 受信メッセージをログに記録
    await db
      .prepare(
        `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, created_at)
         VALUES (?, ?, 'incoming', 'text', ?, NULL, NULL, ?)`,
      )
      .bind(logId, friend.id, incomingText, now)
      .run();

    // チャットを作成/更新（オペレーター機能連携）
    await upsertChatOnMessage(db, friend.id);

    // 自動返信チェック
    // NOTE: Auto-replies use replyMessage (free, no quota) instead of pushMessage
    // The replyToken is only valid for ~1 minute after the message event
    const autoReplies = await db
      .prepare(`SELECT * FROM auto_replies WHERE is_active = 1 ORDER BY created_at ASC`)
      .all<{
        id: string;
        keyword: string;
        match_type: 'exact' | 'contains';
        response_type: string;
        response_content: string;
        is_active: number;
        created_at: string;
      }>();

    let matched = false;
    for (const rule of autoReplies.results) {
      const isMatch =
        rule.match_type === 'exact'
          ? incomingText === rule.keyword
          : incomingText.includes(rule.keyword);

      if (isMatch) {
        try {
          if (rule.response_type === 'text') {
            await lineClient.replyMessage(event.replyToken, [
              { type: 'text', text: rule.response_content },
            ]);
          } else if (rule.response_type === 'image') {
            const parsed = JSON.parse(rule.response_content) as {
              originalContentUrl: string;
              previewImageUrl: string;
            };
            await lineClient.replyMessage(event.replyToken, [
              { type: 'image', originalContentUrl: parsed.originalContentUrl, previewImageUrl: parsed.previewImageUrl },
            ]);
          } else if (rule.response_type === 'flex') {
            const contents = JSON.parse(rule.response_content);
            await lineClient.replyMessage(event.replyToken, [
              { type: 'flex', altText: 'Message', contents },
            ]);
          }

          // 送信ログ
          const outLogId = crypto.randomUUID();
          await db
            .prepare(
              `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, created_at)
               VALUES (?, ?, 'outgoing', ?, ?, NULL, NULL, ?)`,
            )
            .bind(outLogId, friend.id, rule.response_type, rule.response_content, jstNow())
            .run();
        } catch (err) {
          console.error('Failed to send auto-reply', err);
        }

        matched = true;
        break;
      }
    }

    // 自動応答にマッチせず、停止/再開でもない場合 → メール通知
    if (!matched && incomingText.trim() !== '停止' && incomingText.trim() !== '再開' && env.RESEND_API_KEY) {
      try {
        await notifyUnmatchedMessage(env.RESEND_API_KEY, friend.display_name ?? null, incomingText);
      } catch (e) { console.error('Email notify (unmatched) failed:', e); }
    }

    // イベントバス発火: message_received
    await fireEvent(db, 'message_received', {
      friendId: friend.id,
      eventData: { text: incomingText, matched },
    }, lineAccessToken);

    return;
  }

  // ─── Postback イベント（リッチメニュー対応） ────────────────────
  if (event.type === 'postback') {
    const userId = event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    const data = (event as { postback: { data: string } }).postback.data;
    const params = new URLSearchParams(data);
    const page = params.get('page');

    if (!page) return;

    const friend = await getFriendByLineUserId(db, userId);
    if (!friend) return;

    // Workers のベースURL を構築（環境変数から取得できない場合のフォールバック）
    const baseUrl = (env as unknown as Record<string, string | undefined>).WORKERS_URL || '';

    const PAGE_MAP: Record<string, { path: string; title: string }> = {
      home: { path: '/liff/home', title: 'ホーム' },
      live: { path: '/liff/live', title: 'Live配信' },
      videos: { path: '/liff/videos', title: '動画コンテンツ' },
      mypage: { path: '/liff/mypage', title: 'マイページ' },
    };

    const target = PAGE_MAP[page];
    if (!target) return;

    const url = `${baseUrl}${target.path}?fid=${friend.id}`;

    const replyToken = (event as { replyToken?: string }).replyToken;
    if (replyToken) {
      try {
        await lineClient.replyMessage(replyToken, [{
          type: 'flex',
          altText: target.title,
          contents: {
            type: 'bubble',
            body: {
              type: 'box', layout: 'vertical', spacing: 'md',
              contents: [
                { type: 'text', text: target.title, weight: 'bold', size: 'lg', color: '#1a6b5a' },
                { type: 'text', text: '下のボタンをタップして開きます', size: 'sm', color: '#888888', margin: 'sm' },
              ],
            },
            footer: {
              type: 'box', layout: 'vertical',
              contents: [{
                type: 'button', style: 'primary', color: '#1a6b5a',
                action: { type: 'uri', label: `${target.title}を開く`, uri: url },
              }],
            },
          },
        }]);
      } catch (err) {
        console.error('Failed to reply to postback:', err);
      }
    }

    return;
  }
}

/**
 * 流入経路マッチング: 直近5分以内のtracking_clicksで未マッチのクリックを紐付け
 */
async function matchTrackingSource(db: D1Database, lineUserId: string): Promise<void> {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const click = await db
    .prepare(
      'SELECT id, source FROM tracking_clicks WHERE matched_line_user_id IS NULL AND clicked_at > ? ORDER BY clicked_at DESC LIMIT 1',
    )
    .bind(fiveMinAgo)
    .first<{ id: number; source: string }>();

  if (click) {
    await db
      .prepare(
        "UPDATE tracking_clicks SET matched_line_user_id = ?, matched_at = datetime('now') WHERE id = ?",
      )
      .bind(lineUserId, click.id)
      .run();

    await db
      .prepare(
        "UPDATE friends SET source = ?, source_matched_at = datetime('now') WHERE line_user_id = ?",
      )
      .bind(click.source, lineUserId)
      .run();
  }
}

export { webhook };
