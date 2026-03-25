'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchApi } from '@/lib/api'
import Header from '@/components/layout/header'

type RevenueData = {
  mrr: number
  arpu: number
  ltv: number
  churnRate: number
  activeCount: number
  pausedCount: number
  cancelScheduledCount: number
  churnedThisMonth: number
  price: number
  mrrTrend: { month: string; mrr: number; members: number }[]
}

type MembersData = {
  totalActive: number
  newThisMonth: number
  churnedThisMonth: number
  netGrowth: number
  monthlyGrowth: { month: string; newMembers: number; churned: number; net: number }[]
  cohorts: { cohort: string; total: number; retained: number[] }[]
}

function formatYen(v: number) { return `¥${v.toLocaleString()}` }
function formatMonth(m: string) {
  const [y, mo] = m.split('-')
  return `${y}/${mo}`
}

function BarChart({ data, maxVal, color }: { data: { label: string; value: number }[]; maxVal: number; color: string }) {
  return (
    <div className="flex items-end gap-1 h-40">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full rounded-t relative" style={{ height: `${maxVal > 0 ? (d.value / maxVal) * 100 : 0}%`, backgroundColor: color, minHeight: d.value > 0 ? 4 : 0 }} />
          <span className="text-[10px] text-gray-400 whitespace-nowrap">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

export default function AnalyticsPage() {
  const [revenue, setRevenue] = useState<RevenueData | null>(null)
  const [members, setMembers] = useState<MembersData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'revenue' | 'members'>('revenue')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [revRes, memRes] = await Promise.allSettled([
        fetchApi<{ success: boolean; data: RevenueData }>('/api/analytics/revenue'),
        fetchApi<{ success: boolean; data: MembersData }>('/api/analytics/members'),
      ])
      if (revRes.status === 'fulfilled' && revRes.value.success) setRevenue(revRes.value.data)
      if (memRes.status === 'fulfilled' && memRes.value.success) setMembers(memRes.value.data)
    } catch {
      setError('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div>
        <Header title="データ分析" description="売上・会員のインサイト分析" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
              <div className="h-3 bg-gray-200 rounded w-16 mb-2" />
              <div className="h-7 bg-gray-200 rounded w-24" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <Header title="データ分析" description="売上・会員のインサイト分析" />

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {/* タブ切替 */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setTab('revenue')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'revenue' ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          売上・収益指標
        </button>
        <button
          onClick={() => setTab('members')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'members' ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          会員獲得・維持指標
        </button>
      </div>

      {/* ===== 売上・収益指標タブ ===== */}
      {tab === 'revenue' && revenue && (
        <>
          {/* KPIカード */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 mb-1">MRR（月次経常収益）</p>
              <p className="text-2xl font-bold text-gray-900">{formatYen(revenue.mrr)}</p>
              <p className="text-xs text-gray-400 mt-1">アクティブ {revenue.activeCount}名 × {formatYen(revenue.price)}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 mb-1">ARPU（1人あたり売上）</p>
              <p className="text-2xl font-bold text-gray-900">{formatYen(revenue.arpu)}</p>
              <p className="text-xs text-gray-400 mt-1">月間の会員あたり平均</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 mb-1">LTV（顧客生涯価値）</p>
              <p className="text-2xl font-bold text-gray-900">{formatYen(revenue.ltv)}</p>
              <p className="text-xs text-gray-400 mt-1">ARPU ÷ 解約率で算出</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 mb-1">チャーンレート（解約率）</p>
              <p className="text-2xl font-bold" style={{ color: revenue.churnRate > 10 ? '#dc2626' : revenue.churnRate > 5 ? '#d97706' : '#059669' }}>
                {revenue.churnRate}%
              </p>
              <p className="text-xs text-gray-400 mt-1">
                今月 {revenue.churnedThisMonth}名退会
                {revenue.churnRate <= 5 && ' (良好)'}
                {revenue.churnRate > 5 && revenue.churnRate <= 10 && ' (注意)'}
                {revenue.churnRate > 10 && ' (危険)'}
              </p>
            </div>
          </div>

          {/* MRR推移グラフ */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">MRR推移（過去12ヶ月）</h3>
            <div className="mb-2">
              <BarChart
                data={revenue.mrrTrend.map(t => ({ label: formatMonth(t.month), value: t.mrr }))}
                maxVal={Math.max(...revenue.mrrTrend.map(t => t.mrr), 1)}
                color="#06C755"
              />
            </div>
            <div className="flex items-end gap-1 mt-1">
              {revenue.mrrTrend.map((t, i) => (
                <div key={i} className="flex-1 text-center text-[10px] text-gray-500 font-medium">
                  {t.mrr > 0 ? formatYen(t.mrr) : ''}
                </div>
              ))}
            </div>
          </div>

          {/* 会員ステータス内訳 */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">会員ステータス内訳</h3>
            <div className="space-y-3">
              {[
                { label: 'アクティブ', count: revenue.activeCount, color: '#059669' },
                { label: '休会中', count: revenue.pausedCount, color: '#d97706' },
                { label: '退会予定', count: revenue.cancelScheduledCount, color: '#dc2626' },
              ].map((s, i) => {
                const total = revenue.activeCount + revenue.pausedCount + revenue.cancelScheduledCount
                const pct = total > 0 ? Math.round((s.count / total) * 100) : 0
                return (
                  <div key={i}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">{s.label}</span>
                      <span className="font-semibold">{s.count}名 ({pct}%)</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* ===== 会員獲得・維持指標タブ ===== */}
      {tab === 'members' && members && (
        <>
          {/* KPIカード */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 mb-1">総有効会員数</p>
              <p className="text-2xl font-bold text-gray-900">{members.totalActive}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 mb-1">今月の新規入会</p>
              <p className="text-2xl font-bold text-green-600">+{members.newThisMonth}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 mb-1">今月の退会</p>
              <p className="text-2xl font-bold text-red-600">-{members.churnedThisMonth}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 mb-1">純増数</p>
              <p className={`text-2xl font-bold ${members.netGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {members.netGrowth >= 0 ? '+' : ''}{members.netGrowth}
              </p>
            </div>
          </div>

          {/* 月別推移 */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">月別 新規入会・退会推移</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-medium text-gray-600">月</th>
                    <th className="text-right py-2 px-3 font-medium text-green-600">新規</th>
                    <th className="text-right py-2 px-3 font-medium text-red-600">退会</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">純増</th>
                  </tr>
                </thead>
                <tbody>
                  {members.monthlyGrowth.filter(m => m.newMembers > 0 || m.churned > 0).length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-8 text-gray-400">データがまだありません</td></tr>
                  ) : (
                    members.monthlyGrowth.map((m, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-2 px-3 font-medium">{formatMonth(m.month)}</td>
                        <td className="py-2 px-3 text-right text-green-600">+{m.newMembers}</td>
                        <td className="py-2 px-3 text-right text-red-600">{m.churned > 0 ? `-${m.churned}` : '0'}</td>
                        <td className={`py-2 px-3 text-right font-semibold ${m.net >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                          {m.net >= 0 ? `+${m.net}` : m.net}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* コホート別継続率 */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">コホート別継続率</h3>
            <p className="text-xs text-gray-400 mb-4">入会月ごとにグループ化し、何ヶ月目に離脱しやすいかを可視化</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-medium text-gray-600">コホート</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">入会数</th>
                    {[...Array(6)].map((_, i) => (
                      <th key={i} className="text-center py-2 px-2 font-medium text-gray-600 text-xs">
                        {i === 0 ? '入会月' : `${i}ヶ月後`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {members.cohorts.filter(c => c.total > 0).length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-8 text-gray-400">データがまだありません</td></tr>
                  ) : (
                    members.cohorts.filter(c => c.total > 0).map((c, ci) => (
                      <tr key={ci} className="border-b border-gray-100">
                        <td className="py-2 px-3 font-medium">{formatMonth(c.cohort)}</td>
                        <td className="py-2 px-3 text-right">{c.total}名</td>
                        {[...Array(6)].map((_, mi) => {
                          const val = c.retained[mi]
                          if (val === undefined) return <td key={mi} className="py-2 px-2 text-center text-gray-300">-</td>
                          const bg = val >= 80 ? '#dcfce7' : val >= 50 ? '#fef9c3' : val >= 20 ? '#fed7aa' : '#fecaca'
                          return (
                            <td key={mi} className="py-2 px-2 text-center">
                              <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold" style={{ backgroundColor: bg }}>
                                {val}%
                              </span>
                            </td>
                          )
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
