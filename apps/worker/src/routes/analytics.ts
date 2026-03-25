import { Hono } from 'hono';
import { jstNow } from '@line-crm/db';
import type { Env } from '../index.js';

const analytics = new Hono<Env>();

// ========== 売上・収益指標 ==========

analytics.get('/api/analytics/revenue', async (c) => {
  try {
    const db = c.env.DB;
    const PRICE = 2980;
    const now = new Date();

    // アクティブ会員数
    const activeRow = await db
      .prepare(`SELECT COUNT(*) as cnt FROM friends WHERE subscription_status IN ('active', 'trialing')`)
      .first<{ cnt: number }>();
    const activeCount = activeRow?.cnt ?? 0;

    // 休会中
    const pausedRow = await db
      .prepare(`SELECT COUNT(*) as cnt FROM friends WHERE subscription_status = 'paused'`)
      .first<{ cnt: number }>();

    // 退会予定
    const cancelScheduledRow = await db
      .prepare(`SELECT COUNT(*) as cnt FROM friends WHERE subscription_status = 'cancel_scheduled'`)
      .first<{ cnt: number }>();

    // MRR / ARPU
    const mrr = activeCount * PRICE;
    const arpu = activeCount > 0 ? Math.round(mrr / activeCount) : 0;

    // 解約率（今月）
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const churnedThisMonthRow = await db
      .prepare(`SELECT COUNT(*) as cnt FROM stripe_events WHERE event_type = 'customer.subscription.deleted' AND processed_at >= ?`)
      .bind(monthStart)
      .first<{ cnt: number }>();
    const churnedThisMonth = churnedThisMonthRow?.cnt ?? 0;
    const startOfMonthActive = activeCount + churnedThisMonth;
    const churnRate = startOfMonthActive > 0
      ? Math.round((churnedThisMonth / startOfMonthActive) * 10000) / 100
      : 0;

    // LTV
    const monthlyChurnDecimal = churnRate / 100;
    const ltv = monthlyChurnDecimal > 0
      ? Math.round(arpu / monthlyChurnDecimal)
      : arpu * 24;

    // ===== 過去28日間の収益分析 =====
    const days28Ago = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString();
    const days56Ago = new Date(now.getTime() - 56 * 24 * 60 * 60 * 1000).toISOString();

    // 過去28日間の決済成功額
    const rev28Row = await db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt FROM stripe_events
         WHERE event_type = 'payment_intent.succeeded' AND processed_at >= ?`,
      )
      .bind(days28Ago)
      .first<{ total: number; cnt: number }>();

    // 前28日間（比較用）
    const rev56Row = await db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt FROM stripe_events
         WHERE event_type = 'payment_intent.succeeded' AND processed_at >= ? AND processed_at < ?`,
      )
      .bind(days56Ago, days28Ago)
      .first<{ total: number; cnt: number }>();

    // 過去28日の新規サブスク数
    const newSubs28Row = await db
      .prepare(`SELECT COUNT(*) as cnt FROM stripe_events WHERE event_type = 'checkout.session.completed' AND processed_at >= ?`)
      .bind(days28Ago)
      .first<{ cnt: number }>();

    // 過去28日の退会数
    const churned28Row = await db
      .prepare(`SELECT COUNT(*) as cnt FROM stripe_events WHERE event_type = 'customer.subscription.deleted' AND processed_at >= ?`)
      .bind(days28Ago)
      .first<{ cnt: number }>();

    // 過去28日の支払い失敗数
    const failed28Row = await db
      .prepare(`SELECT COUNT(*) as cnt FROM stripe_events WHERE event_type = 'invoice.payment_failed' AND processed_at >= ?`)
      .bind(days28Ago)
      .first<{ cnt: number }>();

    const revenue28 = (rev28Row?.total ?? 0) / 100; // Stripe金額は最小単位
    const revenuePrev28 = (rev56Row?.total ?? 0) / 100;
    const revenueChange = revenuePrev28 > 0
      ? Math.round(((revenue28 - revenuePrev28) / revenuePrev28) * 100)
      : revenue28 > 0 ? 100 : 0;

    // 日別売上（過去28日）
    const dailyRevenue: { date: string; amount: number }[] = [];
    for (let i = 27; i >= 0; i--) {
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1);
      const dateKey = `${dayStart.getMonth() + 1}/${dayStart.getDate()}`;
      const dayRow = await db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) as total FROM stripe_events
           WHERE event_type = 'payment_intent.succeeded'
           AND processed_at >= ? AND processed_at < ?`,
        )
        .bind(dayStart.toISOString(), dayEnd.toISOString())
        .first<{ total: number }>();
      dailyRevenue.push({ date: dateKey, amount: (dayRow?.total ?? 0) / 100 });
    }

    // MRR推移（過去12ヶ月）
    const mrrTrend: { month: string; mrr: number; members: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const futureChurned = await db
        .prepare(`SELECT COUNT(*) as cnt FROM stripe_events WHERE event_type = 'customer.subscription.deleted' AND processed_at > ?`)
        .bind(monthEnd)
        .first<{ cnt: number }>();
      const futureNew = await db
        .prepare(`SELECT COUNT(*) as cnt FROM stripe_events WHERE event_type = 'checkout.session.completed' AND processed_at > ?`)
        .bind(monthEnd)
        .first<{ cnt: number }>();

      const estimatedMembers = Math.max(0, activeCount - (futureNew?.cnt ?? 0) + (futureChurned?.cnt ?? 0));
      mrrTrend.push({ month: monthKey, mrr: estimatedMembers * PRICE, members: estimatedMembers });
    }

    return c.json({
      success: true,
      data: {
        mrr, arpu, ltv, churnRate,
        activeCount,
        pausedCount: pausedRow?.cnt ?? 0,
        cancelScheduledCount: cancelScheduledRow?.cnt ?? 0,
        churnedThisMonth, price: PRICE, mrrTrend,
        // 過去28日間
        last28Days: {
          revenue: revenue28,
          revenuePrev: revenuePrev28,
          revenueChange,
          newSubscriptions: newSubs28Row?.cnt ?? 0,
          cancellations: churned28Row?.cnt ?? 0,
          paymentFailures: failed28Row?.cnt ?? 0,
          dailyRevenue,
        },
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
    const now = new Date();

    // 総有効会員数
    const totalRow = await db
      .prepare(`SELECT COUNT(*) as cnt FROM friends WHERE subscription_status IN ('active', 'trialing', 'paused', 'cancel_scheduled')`)
      .first<{ cnt: number }>();

    // 今月の新規入会 / 退会
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const newThisMonthRow = await db
      .prepare(`SELECT COUNT(*) as cnt FROM stripe_events WHERE event_type = 'checkout.session.completed' AND processed_at >= ?`)
      .bind(monthStart)
      .first<{ cnt: number }>();
    const churnedThisMonthRow = await db
      .prepare(`SELECT COUNT(*) as cnt FROM stripe_events WHERE event_type = 'customer.subscription.deleted' AND processed_at >= ?`)
      .bind(monthStart)
      .first<{ cnt: number }>();

    const newThisMonth = newThisMonthRow?.cnt ?? 0;
    const churnedThisMonth = churnedThisMonthRow?.cnt ?? 0;
    const netGrowth = newThisMonth - churnedThisMonth;

    // ===== 友だち追加数の推移（過去12ヶ月） =====
    const friendsTrend: { month: string; newFriends: number; totalFriends: number }[] = [];
    const totalFriendsRow = await db
      .prepare(`SELECT COUNT(*) as cnt FROM friends`)
      .first<{ cnt: number }>();
    let runningTotal = totalFriendsRow?.cnt ?? 0;

    // 逆算: 各月の新規友だち数を取得し、トータルを逆算
    const monthlyNewFriends: { month: string; cnt: number }[] = [];
    for (let i = 0; i <= 11; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStart = d.toISOString();
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const row = await db
        .prepare(`SELECT COUNT(*) as cnt FROM friends WHERE created_at >= ? AND created_at <= ?`)
        .bind(mStart, mEnd)
        .first<{ cnt: number }>();
      monthlyNewFriends.push({ month: monthKey, cnt: row?.cnt ?? 0 });
    }

    // 累計を逆算して構築
    let cumTotal = runningTotal;
    for (let i = 0; i < monthlyNewFriends.length; i++) {
      if (i === 0) {
        friendsTrend.unshift({ month: monthlyNewFriends[i].month, newFriends: monthlyNewFriends[i].cnt, totalFriends: cumTotal });
      } else {
        cumTotal -= monthlyNewFriends[i - 1].cnt;
        friendsTrend.unshift({ month: monthlyNewFriends[i].month, newFriends: monthlyNewFriends[i].cnt, totalFriends: Math.max(0, cumTotal) });
      }
    }

    // ===== アクティブ会員の推移（過去12ヶ月） =====
    const activeRow = await db
      .prepare(`SELECT COUNT(*) as cnt FROM friends WHERE subscription_status IN ('active', 'trialing')`)
      .first<{ cnt: number }>();
    const currentActive = activeRow?.cnt ?? 0;

    const activeTrend: { month: string; active: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const futureChurned = await db
        .prepare(`SELECT COUNT(*) as cnt FROM stripe_events WHERE event_type = 'customer.subscription.deleted' AND processed_at > ?`)
        .bind(monthEnd)
        .first<{ cnt: number }>();
      const futureNew = await db
        .prepare(`SELECT COUNT(*) as cnt FROM stripe_events WHERE event_type = 'checkout.session.completed' AND processed_at > ?`)
        .bind(monthEnd)
        .first<{ cnt: number }>();

      const estimated = Math.max(0, currentActive - (futureNew?.cnt ?? 0) + (futureChurned?.cnt ?? 0));
      activeTrend.push({ month: monthKey, active: estimated });
    }

    // ===== 退会数の推移（過去12ヶ月） =====
    const churnTrend: { month: string; churned: number }[] = [];

    // ===== 月別推移（新規・退会・純増） =====
    const monthlyGrowth: { month: string; newMembers: number; churned: number; net: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStart = d.toISOString();
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      const newRow = await db
        .prepare(`SELECT COUNT(*) as cnt FROM stripe_events WHERE event_type = 'checkout.session.completed' AND processed_at >= ? AND processed_at <= ?`)
        .bind(mStart, mEnd)
        .first<{ cnt: number }>();
      const churnRow = await db
        .prepare(`SELECT COUNT(*) as cnt FROM stripe_events WHERE event_type = 'customer.subscription.deleted' AND processed_at >= ? AND processed_at <= ?`)
        .bind(mStart, mEnd)
        .first<{ cnt: number }>();

      const n = newRow?.cnt ?? 0;
      const ch = churnRow?.cnt ?? 0;
      monthlyGrowth.push({ month: monthKey, newMembers: n, churned: ch, net: n - ch });
      churnTrend.push({ month: monthKey, churned: ch });
    }

    // ===== 有料会員への転換率 =====
    const totalFriends = totalFriendsRow?.cnt ?? 0;
    const totalPaidEver = await db
      .prepare(`SELECT COUNT(*) as cnt FROM friends WHERE stripe_customer_id IS NOT NULL`)
      .first<{ cnt: number }>();
    const paidConversionRate = totalFriends > 0
      ? Math.round(((totalPaidEver?.cnt ?? 0) / totalFriends) * 10000) / 100
      : 0;

    // ===== 平均継続率 =====
    // アクティブ会員の平均在籍月数
    const avgTenureRow = await db
      .prepare(
        `SELECT AVG(
           (julianday('now') - julianday(created_at)) / 30.0
         ) as avg_months
         FROM friends
         WHERE subscription_status IN ('active', 'trialing', 'paused', 'cancel_scheduled')`,
      )
      .first<{ avg_months: number | null }>();
    const avgRetentionMonths = Math.round((avgTenureRow?.avg_months ?? 0) * 10) / 10;

    // 全有料ユーザー（過去含む）の平均継続率
    const allPaidTenure = await db
      .prepare(
        `SELECT AVG(
           (julianday(COALESCE(updated_at, 'now')) - julianday(created_at)) / 30.0
         ) as avg_months
         FROM friends
         WHERE stripe_customer_id IS NOT NULL`,
      )
      .first<{ avg_months: number | null }>();
    const avgLifetimeMonths = Math.round((allPaidTenure?.avg_months ?? 0) * 10) / 10;

    // ===== コホート別継続率 =====
    const cohorts: { cohort: string; total: number; retained: number[] }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const cohortStart = d.toISOString();
      const cohortEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
      const cohortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

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

      const retained: number[] = [];
      const friendIds = cohortMembers.results.map((r) => r.friend_id);
      for (let m = 0; m <= i; m++) {
        if (m === 0) { retained.push(100); continue; }
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
        totalFriends,
        newThisMonth, churnedThisMonth, netGrowth,
        friendsTrend,
        activeTrend,
        churnTrend,
        monthlyGrowth,
        paidConversionRate,
        avgRetentionMonths,
        avgLifetimeMonths,
        cohorts,
      },
    });
  } catch (err) {
    console.error('GET /api/analytics/members error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { analytics };
