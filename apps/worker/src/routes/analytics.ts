import { Hono } from 'hono';
import { jstNow } from '@line-crm/db';
import type { Env } from '../index.js';

const analytics = new Hono<Env>();

// ========== 売上・収益指標 ==========

analytics.get('/api/analytics/revenue', async (c) => {
  try {
    const db = c.env.DB;
    const PRICE = 2980;

    // アクティブ会員数
    const activeRow = await db
      .prepare(`SELECT COUNT(*) as cnt FROM friends WHERE subscription_status IN ('active', 'trialing')`)
      .first<{ cnt: number }>();
    const activeCount = activeRow?.cnt ?? 0;

    // 休会中（課金停止だがメンバー）
    const pausedRow = await db
      .prepare(`SELECT COUNT(*) as cnt FROM friends WHERE subscription_status = 'paused'`)
      .first<{ cnt: number }>();

    // 退会予定
    const cancelScheduledRow = await db
      .prepare(`SELECT COUNT(*) as cnt FROM friends WHERE subscription_status = 'cancel_scheduled'`)
      .first<{ cnt: number }>();

    // MRR = アクティブ会員 × 月額
    const mrr = activeCount * PRICE;

    // ARPU = MRR / アクティブ会員数
    const arpu = activeCount > 0 ? Math.round(mrr / activeCount) : 0;

    // 解約率（今月の解約数 / 月初のアクティブ数）
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const churnedThisMonthRow = await db
      .prepare(
        `SELECT COUNT(*) as cnt FROM stripe_events
         WHERE event_type = 'customer.subscription.deleted'
         AND processed_at >= ?`,
      )
      .bind(monthStart)
      .first<{ cnt: number }>();
    const churnedThisMonth = churnedThisMonthRow?.cnt ?? 0;

    // 月初のアクティブ数 = 現在のアクティブ + 今月退会した分
    const startOfMonthActive = activeCount + churnedThisMonth;
    const churnRate = startOfMonthActive > 0
      ? Math.round((churnedThisMonth / startOfMonthActive) * 10000) / 100
      : 0;

    // LTV = ARPU / 月次解約率
    const monthlyChurnDecimal = churnRate / 100;
    const ltv = monthlyChurnDecimal > 0
      ? Math.round(arpu / monthlyChurnDecimal)
      : arpu * 24; // 解約なしの場合は24ヶ月分で仮計算

    // MRR推移（過去12ヶ月）
    // checkout.session.completed と customer.subscription.deleted からネット増減を算出
    const mrrTrend: { month: string; mrr: number; members: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();

      // その月末時点でのアクティブ数（近似: 現在のアクティブ - その月以降の純減）
      const futureChurned = await db
        .prepare(
          `SELECT COUNT(*) as cnt FROM stripe_events
           WHERE event_type = 'customer.subscription.deleted'
           AND processed_at > ?`,
        )
        .bind(monthEnd)
        .first<{ cnt: number }>();

      const futureNew = await db
        .prepare(
          `SELECT COUNT(*) as cnt FROM stripe_events
           WHERE event_type = 'checkout.session.completed'
           AND processed_at > ?`,
        )
        .bind(monthEnd)
        .first<{ cnt: number }>();

      const estimatedMembers = Math.max(0, activeCount - (futureNew?.cnt ?? 0) + (futureChurned?.cnt ?? 0));
      mrrTrend.push({
        month: monthKey,
        mrr: estimatedMembers * PRICE,
        members: estimatedMembers,
      });
    }

    return c.json({
      success: true,
      data: {
        mrr,
        arpu,
        ltv,
        churnRate,
        activeCount,
        pausedCount: pausedRow?.cnt ?? 0,
        cancelScheduledCount: cancelScheduledRow?.cnt ?? 0,
        churnedThisMonth,
        price: PRICE,
        mrrTrend,
      },
    });
  } catch (err) {
    console.error('GET /api/analytics/revenue error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 会員獲得・維持指標 ==========

analytics.get('/api/analytics/members', async (c) => {
  try {
    const db = c.env.DB;

    // 総有効会員数（サブスク関連ステータスを持つ全員）
    const totalRow = await db
      .prepare(
        `SELECT COUNT(*) as cnt FROM friends
         WHERE subscription_status IN ('active', 'trialing', 'paused', 'cancel_scheduled')`,
      )
      .first<{ cnt: number }>();

    // 今月の新規入会
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const newThisMonthRow = await db
      .prepare(
        `SELECT COUNT(*) as cnt FROM stripe_events
         WHERE event_type = 'checkout.session.completed'
         AND processed_at >= ?`,
      )
      .bind(monthStart)
      .first<{ cnt: number }>();

    // 今月の退会
    const churnedThisMonthRow = await db
      .prepare(
        `SELECT COUNT(*) as cnt FROM stripe_events
         WHERE event_type = 'customer.subscription.deleted'
         AND processed_at >= ?`,
      )
      .bind(monthStart)
      .first<{ cnt: number }>();

    const newThisMonth = newThisMonthRow?.cnt ?? 0;
    const churnedThisMonth = churnedThisMonthRow?.cnt ?? 0;
    const netGrowth = newThisMonth - churnedThisMonth;

    // 月別推移（過去12ヶ月の新規・退会数）
    const monthlyGrowth: { month: string; newMembers: number; churned: number; net: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStart = d.toISOString();
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      const newRow = await db
        .prepare(
          `SELECT COUNT(*) as cnt FROM stripe_events
           WHERE event_type = 'checkout.session.completed'
           AND processed_at >= ? AND processed_at <= ?`,
        )
        .bind(mStart, mEnd)
        .first<{ cnt: number }>();

      const churnRow = await db
        .prepare(
          `SELECT COUNT(*) as cnt FROM stripe_events
           WHERE event_type = 'customer.subscription.deleted'
           AND processed_at >= ? AND processed_at <= ?`,
        )
        .bind(mStart, mEnd)
        .first<{ cnt: number }>();

      const n = newRow?.cnt ?? 0;
      const ch = churnRow?.cnt ?? 0;
      monthlyGrowth.push({ month: monthKey, newMembers: n, churned: ch, net: n - ch });
    }

    // コホート別継続率
    // 入会月ごとにグループ化し、各月の残存率を計算
    const cohorts: { cohort: string; total: number; retained: number[] }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const cohortStart = d.toISOString();
      const cohortEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
      const cohortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      // このコホートの入会者数（checkout.session.completedのfriend_idで特定）
      const cohortMembers = await db
        .prepare(
          `SELECT DISTINCT friend_id FROM stripe_events
           WHERE event_type = 'checkout.session.completed'
           AND processed_at >= ? AND processed_at <= ?
           AND friend_id IS NOT NULL`,
        )
        .bind(cohortStart, cohortEnd)
        .all<{ friend_id: string }>();

      const total = cohortMembers.results.length;
      if (total === 0) {
        cohorts.push({ cohort: cohortKey, total: 0, retained: [] });
        continue;
      }

      // 各月末時点での残存数を確認
      const retained: number[] = [];
      for (let m = 0; m <= i; m++) {
        if (m === 0) {
          retained.push(100); // 入会月は100%
          continue;
        }
        // m ヶ月後の時点で、コホートメンバーのうちまだアクティブな人数
        // 簡易計算: 現在のステータスで判定（精密にはスナップショットが必要）
        const friendIds = cohortMembers.results.map((r) => r.friend_id);
        if (friendIds.length === 0) {
          retained.push(0);
          continue;
        }
        const placeholders = friendIds.map(() => '?').join(',');
        const stillActive = await db
          .prepare(
            `SELECT COUNT(*) as cnt FROM friends
             WHERE id IN (${placeholders})
             AND subscription_status IN ('active', 'trialing', 'paused', 'cancel_scheduled')`,
          )
          .bind(...friendIds)
          .first<{ cnt: number }>();

        retained.push(total > 0 ? Math.round(((stillActive?.cnt ?? 0) / total) * 100) : 0);
      }

      cohorts.push({ cohort: cohortKey, total, retained });
    }

    return c.json({
      success: true,
      data: {
        totalActive: totalRow?.cnt ?? 0,
        newThisMonth,
        churnedThisMonth,
        netGrowth,
        monthlyGrowth,
        cohorts,
      },
    });
  } catch (err) {
    console.error('GET /api/analytics/members error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { analytics };
