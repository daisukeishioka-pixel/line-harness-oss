import type { LineClient } from '@line-crm/line-sdk';

/**
 * ステップ配信エンジン — 7日間チャレンジ等のシーケンス配信を処理
 * Cron Trigger（毎時）から呼び出される
 */
export async function processSequenceDeliveries(
  db: D1Database,
  lineClient: LineClient,
): Promise<void> {
  // アクティブなシーケンスを取得
  const activeSequences = await db
    .prepare(
      'SELECT id, line_user_id, sequence_name, current_step, started_at, last_sent_at FROM user_sequences WHERE status = ?',
    )
    .bind('active')
    .all<{
      id: number;
      line_user_id: string;
      sequence_name: string;
      current_step: number;
      started_at: string;
      last_sent_at: string | null;
    }>();

  if (!activeSequences.results?.length) return;

  const now = new Date();

  // JST 20時台（UTC 11時台）のみ配信（Day 0 即時配信は Webhook で処理済み）
  const jstHour = (now.getUTCHours() + 9) % 24;
  if (jstHour !== 20) return;

  for (const seq of activeSequences.results) {
    try {
      await processOneSequence(db, lineClient, seq, now);
    } catch (err) {
      console.error(`Error processing sequence ${seq.id}:`, err);
    }
  }
}

async function processOneSequence(
  db: D1Database,
  lineClient: LineClient,
  seq: {
    id: number;
    line_user_id: string;
    sequence_name: string;
    current_step: number;
    started_at: string;
    last_sent_at: string | null;
  },
  now: Date,
): Promise<void> {
  // 次に送るべきメッセージを取得
  const nextMsg = await db
    .prepare(
      'SELECT * FROM step_messages WHERE sequence_name = ? AND step_number > ? AND is_active = 1 ORDER BY step_number ASC LIMIT 1',
    )
    .bind(seq.sequence_name, seq.current_step)
    .first<{
      id: number;
      sequence_name: string;
      step_number: number;
      delay_hours: number;
      message_type: string;
      content: string;
      condition_check: string | null;
    }>();

  if (!nextMsg) {
    // シーケンス完了
    await db
      .prepare('UPDATE user_sequences SET status = ?, completed_at = datetime(?) WHERE id = ?')
      .bind('completed', 'now', seq.id)
      .run();
    return;
  }

  // 配信タイミングの計算: started_at + delay_hours を過ぎているか
  const startedAt = new Date(seq.started_at + (seq.started_at.endsWith('Z') ? '' : 'Z'));
  const scheduledTime = new Date(startedAt.getTime() + nextMsg.delay_hours * 60 * 60 * 1000);
  if (now < scheduledTime) return;

  // 既に送信済みかチェック
  const alreadySent = await db
    .prepare(
      'SELECT id FROM delivery_logs WHERE line_user_id = ? AND sequence_name = ? AND step_number = ? AND status = ?',
    )
    .bind(seq.line_user_id, seq.sequence_name, nextMsg.step_number, 'sent')
    .first();

  if (alreadySent) {
    // current_step を進めてスキップ
    await db
      .prepare('UPDATE user_sequences SET current_step = ? WHERE id = ?')
      .bind(nextMsg.step_number, seq.id)
      .run();
    return;
  }

  // condition_check の処理（Day 10: 未入会者のみ）
  if (nextMsg.condition_check === 'not_paid') {
    const user = await db
      .prepare('SELECT subscription_status FROM friends WHERE line_user_id = ?')
      .bind(seq.line_user_id)
      .first<{ subscription_status: string | null }>();
    if (user?.subscription_status === 'active') {
      // 入会済みならスキップしてシーケンス完了
      await db
        .prepare('UPDATE user_sequences SET status = ?, completed_at = datetime(?) WHERE id = ?')
        .bind('completed', 'now', seq.id)
        .run();
      return;
    }
  }

  // メッセージ送信
  try {
    await lineClient.pushMessage(seq.line_user_id, [
      { type: 'text', text: nextMsg.content },
    ]);

    // ログ記録 & ステップ更新
    await logDelivery(db, seq.line_user_id, seq.sequence_name, nextMsg.step_number, 'sent');
    await db
      .prepare('UPDATE user_sequences SET current_step = ?, last_sent_at = datetime(?) WHERE id = ?')
      .bind(nextMsg.step_number, 'now', seq.id)
      .run();
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`Failed to send sequence message to ${seq.line_user_id}:`, errMsg);
    await logDelivery(db, seq.line_user_id, seq.sequence_name, nextMsg.step_number, 'failed', errMsg);
  }
}

/**
 * 友だち追加時にシーケンスを開始する
 */
export async function startSequence(
  db: D1Database,
  lineClient: LineClient,
  lineUserId: string,
  sequenceName = '7day_challenge',
): Promise<void> {
  // 既存チェック
  const existing = await db
    .prepare('SELECT id FROM user_sequences WHERE line_user_id = ? AND sequence_name = ?')
    .bind(lineUserId, sequenceName)
    .first();

  if (existing) return; // 既に開始済み

  // シーケンス開始
  await db
    .prepare(
      'INSERT INTO user_sequences (line_user_id, sequence_name, current_step, status, started_at, last_sent_at) VALUES (?, ?, 0, ?, datetime(?), datetime(?))',
    )
    .bind(lineUserId, sequenceName, 'active', 'now', 'now')
    .run();

  // Day 0 ウェルカムメッセージを即時送信
  const msg = await db
    .prepare('SELECT content FROM step_messages WHERE sequence_name = ? AND step_number = 0 AND is_active = 1')
    .bind(sequenceName)
    .first<{ content: string }>();

  if (msg) {
    try {
      await lineClient.pushMessage(lineUserId, [{ type: 'text', text: msg.content }]);
      await logDelivery(db, lineUserId, sequenceName, 0, 'sent');
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`Failed to send welcome sequence message to ${lineUserId}:`, errMsg);
      await logDelivery(db, lineUserId, sequenceName, 0, 'failed', errMsg);
    }
  }
}

/**
 * 「停止」コマンドでシーケンスを停止
 */
export async function stopSequence(
  db: D1Database,
  lineUserId: string,
): Promise<boolean> {
  const result = await db
    .prepare('UPDATE user_sequences SET status = ? WHERE line_user_id = ? AND status = ?')
    .bind('stopped', lineUserId, 'active')
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/**
 * 「再開」コマンドでシーケンスを再開
 */
export async function resumeSequence(
  db: D1Database,
  lineUserId: string,
): Promise<boolean> {
  const result = await db
    .prepare('UPDATE user_sequences SET status = ? WHERE line_user_id = ? AND status = ?')
    .bind('active', lineUserId, 'stopped')
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

async function logDelivery(
  db: D1Database,
  lineUserId: string,
  sequenceName: string,
  stepNumber: number,
  status: string,
  errorMessage: string | null = null,
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO delivery_logs (line_user_id, sequence_name, step_number, status, error_message) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(lineUserId, sequenceName, stepNumber, status, errorMessage)
    .run();
}
