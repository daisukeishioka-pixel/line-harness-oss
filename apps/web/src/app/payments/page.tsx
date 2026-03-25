'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchApi } from '@/lib/api'
import Header from '@/components/layout/header'

type SubscriptionMember = {
  id: string
  displayName: string | null
  pictureUrl: string | null
  subscriptionStatus: string | null
  subscriptionId: string | null
  stripeCustomerId: string | null
  currentPeriodEnd: string | null
  createdAt: string
}

type StripeEvent = {
  id: string
  stripeEventId: string
  eventType: string
  friendId: string | null
  amount: number | null
  currency: string | null
  processedAt: string
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: 'アクティブ', color: '#059669', bg: '#ecfdf5' },
  trialing: { label: 'トライアル', color: '#2563eb', bg: '#eff6ff' },
  paused: { label: '休会中', color: '#d97706', bg: '#fffbeb' },
  cancel_scheduled: { label: '退会予定', color: '#dc2626', bg: '#fef2f2' },
  incomplete: { label: '入金待ち', color: '#6366f1', bg: '#eef2ff' },
  past_due: { label: '支払い遅延', color: '#ea580c', bg: '#fff7ed' },
  canceled: { label: '解約済み', color: '#6b7280', bg: '#f9fafb' },
}

function StatusBadge({ status }: { status: string | null }) {
  const info = STATUS_MAP[status ?? ''] || { label: status || '未登録', color: '#9ca3af', bg: '#f9fafb' }
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ color: info.color, backgroundColor: info.bg }}
    >
      {info.label}
    </span>
  )
}

function formatDate(iso: string | null) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatEventType(type: string) {
  const map: Record<string, string> = {
    'checkout.session.completed': '決済完了',
    'customer.subscription.updated': 'サブスク更新',
    'customer.subscription.deleted': 'サブスク解約',
    'customer.subscription.paused': '休会',
    'customer.subscription.resumed': '復帰',
    'invoice.payment_failed': '支払い失敗',
    'payment_intent.succeeded': '決済成功',
  }
  return map[type] || type
}

export default function PaymentsPage() {
  const [members, setMembers] = useState<SubscriptionMember[]>([])
  const [events, setEvents] = useState<StripeEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [eventsLoading, setEventsLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'members' | 'events'>('members')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // サブスク会員一覧を取得（friendsテーブルからサブスク情報あり）
  const loadMembers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetchApi<{
        success: boolean
        data: { items: SubscriptionMember[]; total: number }
      }>('/api/payments/members')
      if (res.success) {
        setMembers(res.data.items)
      }
    } catch {
      setError('会員データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  // Stripeイベント一覧を取得
  const loadEvents = useCallback(async () => {
    setEventsLoading(true)
    try {
      const res = await fetchApi<{
        success: boolean
        data: StripeEvent[]
      }>('/api/integrations/stripe/events?limit=50')
      if (res.success) {
        setEvents(res.data)
      }
    } catch {
      // non-blocking
    } finally {
      setEventsLoading(false)
    }
  }, [])

  useEffect(() => { loadMembers() }, [loadMembers])
  useEffect(() => { if (tab === 'events') loadEvents() }, [tab, loadEvents])

  const filteredMembers = statusFilter === 'all'
    ? members
    : members.filter(m => m.subscriptionStatus === statusFilter)

  // 集計
  const activeCount = members.filter(m => m.subscriptionStatus === 'active' || m.subscriptionStatus === 'trialing').length
  const pausedCount = members.filter(m => m.subscriptionStatus === 'paused').length
  const cancelScheduledCount = members.filter(m => m.subscriptionStatus === 'cancel_scheduled').length
  const mrr = activeCount * 2980

  return (
    <div>
      <Header title="決済管理" description="Stripe連携・サブスクリプション管理" />

      {/* KPI カード */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-500 mb-1">アクティブ会員</p>
          <p className="text-2xl font-bold text-gray-900">{activeCount}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-500 mb-1">月間売上（MRR）</p>
          <p className="text-2xl font-bold text-gray-900">&yen;{mrr.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-500 mb-1">休会中</p>
          <p className="text-2xl font-bold text-amber-600">{pausedCount}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-500 mb-1">退会予定</p>
          <p className="text-2xl font-bold text-red-600">{cancelScheduledCount}</p>
        </div>
      </div>

      {/* タブ */}
      <div className="flex border-b border-gray-200 mb-4">
        <button
          onClick={() => setTab('members')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'members' ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          会員一覧
        </button>
        <button
          onClick={() => setTab('events')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'events' ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          決済イベント
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {/* 会員一覧タブ */}
      {tab === 'members' && (
        <>
          {/* フィルター */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {[
              { value: 'all', label: 'すべて' },
              { value: 'active', label: 'アクティブ' },
              { value: 'paused', label: '休会中' },
              { value: 'cancel_scheduled', label: '退会予定' },
              { value: 'incomplete', label: '入金待ち' },
              { value: 'past_due', label: '支払い遅延' },
              { value: 'canceled', label: '解約済み' },
            ].map(f => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  statusFilter === f.value
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="px-4 py-4 border-b border-gray-100 flex items-center gap-4 animate-pulse">
                  <div className="w-10 h-10 bg-gray-200 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-32" />
                    <div className="h-3 bg-gray-100 rounded w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">
              {statusFilter === 'all' ? 'サブスクリプション会員はまだいません' : '該当する会員がいません'}
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 font-medium text-gray-600">会員</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">ステータス</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">次回請求日</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Stripe ID</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">登録日</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMembers.map(m => (
                      <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {m.pictureUrl ? (
                              <img src={m.pictureUrl} alt="" className="w-8 h-8 rounded-full" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                                {(m.displayName || '?')[0]}
                              </div>
                            )}
                            <span className="font-medium text-gray-900">{m.displayName || '名前なし'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={m.subscriptionStatus} /></td>
                        <td className="px-4 py-3 text-gray-600">{formatDate(m.currentPeriodEnd)}</td>
                        <td className="px-4 py-3">
                          {m.stripeCustomerId ? (
                            <a
                              href={`https://dashboard.stripe.com/test/customers/${m.stripeCustomerId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline font-mono"
                            >
                              {m.stripeCustomerId.slice(0, 18)}...
                            </a>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{formatDate(m.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* 決済イベントタブ */}
      {tab === 'events' && (
        eventsLoading ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500 text-sm">読み込み中...</div>
        ) : events.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">決済イベントはまだありません</div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">日時</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">イベント</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">金額</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Stripe Event ID</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map(e => (
                    <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(e.processedAt)}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">{formatEventType(e.eventType)}</span>
                        <span className="ml-2 text-xs text-gray-400">{e.eventType}</span>
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {e.amount ? `¥${(e.amount / 100).toLocaleString()}` : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500 font-mono">{e.stripeEventId.slice(0, 24)}...</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  )
}
