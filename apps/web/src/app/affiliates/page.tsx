'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/header'

import { fetchApi, api } from '@/lib/api'

const WORKER_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'

// ── トラッキングURL プリセット ──
const TRACKING_PRESETS = [
  { source: 'lp', label: 'LP（ランディングページ）' },
  { source: 'instagram', label: 'Instagram' },
  { source: 'referral', label: '紹介' },
  { source: 'meta-ads', label: 'Meta広告' },
  { source: 'google', label: 'Google検索' },
]

type TrackingSourceStat = { source: string; count: number; converted: number }
type TrackingClick = {
  id: number; tracking_id: string; source: string; ip_address: string;
  user_agent: string; clicked_at: string; matched_line_user_id: string | null; matched_at: string | null
}

interface RefRoute {
  refCode: string
  name: string
  friendCount: number
  clickCount: number
  latestAt: string | null
}

interface RefSummaryData {
  routes: RefRoute[]
  totalFriends: number
  friendsWithRef: number
  friendsWithoutRef: number
}

interface RefFriend {
  id: string
  displayName: string
  trackedAt: string | null
}

interface RefDetailData {
  refCode: string
  name: string
  friends: RefFriend[]
}

export default function AttributionPage() {
  const [summary, setSummary] = useState<RefSummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedRef, setSelectedRef] = useState<string | null>(null)
  const [detail, setDetail] = useState<RefDetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [trackingTab, setTrackingTab] = useState<'ref' | 'tracking'>('tracking')
  const [trackingSources, setTrackingSources] = useState<TrackingSourceStat[]>([])
  const [trackingClicks, setTrackingClicks] = useState<TrackingClick[]>([])
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

  const loadSummary = useCallback(async () => {
    setLoading(true)
    try {
      const [refRes, srcRes, clickRes] = await Promise.allSettled([
        fetchApi<{ success: boolean; data: RefSummaryData }>('/api/analytics/ref-summary'),
        api.phase2.trackingSources(),
        api.phase2.trackingClicks(50),
      ])
      if (refRes.status === 'fulfilled') setSummary(refRes.value.data)
      if (srcRes.status === 'fulfilled' && srcRes.value.success) setTrackingSources(srcRes.value.data)
      if (clickRes.status === 'fulfilled' && clickRes.value.success) setTrackingClicks(clickRes.value.data)
    } catch {
      // silent
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadSummary()
  }, [loadSummary])

  const handleRowClick = async (refCode: string) => {
    if (selectedRef === refCode) {
      setSelectedRef(null)
      setDetail(null)
      return
    }
    setSelectedRef(refCode)
    setDetailLoading(true)
    try {
      const res = await fetchApi<{ success: boolean; data: RefDetailData }>(`/api/analytics/ref/${encodeURIComponent(refCode)}`)
      setDetail(res.data)
    } catch {
      setDetail(null)
    }
    setDetailLoading(false)
  }

  const handleCopy = async (refCode: string) => {
    const url = `${WORKER_BASE}/auth/line?ref=${encodeURIComponent(refCode)}`
    await navigator.clipboard.writeText(url)
    setCopiedCode(refCode)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  const handleCopyUrl = async (source: string) => {
    const url = `${WORKER_BASE}/track/${source}`
    await navigator.clipboard.writeText(url)
    setCopiedUrl(source)
    setTimeout(() => setCopiedUrl(null), 2000)
  }

  const formatDateTime = (iso: string | null) => {
    if (!iso) return '-'
    try {
      const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z')
      return d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
    } catch { return iso }
  }

  return (
    <div>
      <Header
        title="流入経路分析"
        description="トラッキングURL・refコード別の友だち獲得実績"
      />

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {([
          { key: 'tracking' as const, label: 'トラッキングURL' },
          { key: 'ref' as const, label: 'refコード (従来)' },
        ]).map(t => (
          <button key={t.key} onClick={() => setTrackingTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${trackingTab === t.key ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── トラッキングURL タブ ── */}
      {trackingTab === 'tracking' && (
        <>
          {/* トラッキングURL一覧 */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto mb-6">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-800">トラッキングURL一覧</h3>
              <p className="text-xs text-gray-400 mt-1">友だち追加リンクの前にこのURLを経由させることで流入経路を自動記録します</p>
            </div>
            <table className="w-full min-w-[720px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">経路名</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">URL</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">クリック数</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">友だち追加数</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">CVR</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {TRACKING_PRESETS.map((preset) => {
                  const stat = trackingSources.find(s => s.source === preset.source)
                  const clicks = stat?.count ?? 0
                  const converted = stat?.converted ?? 0
                  const cvr = clicks > 0 ? Math.round((converted / clicks) * 100) : 0
                  const url = `${WORKER_BASE}/track/${preset.source}`
                  return (
                    <tr key={preset.source} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{preset.label}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono text-gray-500 break-all">{url}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">{clicks}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-green-600">{converted}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600">{cvr}%</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleCopyUrl(preset.source)}
                          className="text-xs font-medium px-3 py-1.5 rounded-md transition-colors min-h-[44px] inline-flex items-center"
                          style={copiedUrl === preset.source ? { color: '#06C755' } : { color: '#3b82f6' }}
                        >
                          {copiedUrl === preset.source ? 'コピー済!' : 'URLコピー'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {/* その他の経路（プリセット外） */}
                {trackingSources
                  .filter(s => !TRACKING_PRESETS.find(p => p.source === s.source))
                  .map(s => {
                    const cvr = s.count > 0 ? Math.round((s.converted / s.count) * 100) : 0
                    const url = `${WORKER_BASE}/track/${s.source}`
                    return (
                      <tr key={s.source} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{s.source}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono text-gray-500 break-all">{url}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">{s.count}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-green-600">{s.converted}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600">{cvr}%</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleCopyUrl(s.source)}
                            className="text-xs font-medium px-3 py-1.5 rounded-md transition-colors min-h-[44px] inline-flex items-center"
                            style={copiedUrl === s.source ? { color: '#06C755' } : { color: '#3b82f6' }}
                          >
                            {copiedUrl === s.source ? 'コピー済!' : 'URLコピー'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>

          {/* クリックログ */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-800">クリックログ（最新50件）</h3>
            </div>
            <table className="w-full min-w-[600px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">経路</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">クリック日時</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">マッチ</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">LINE User ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {trackingClicks.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-sm">クリックログはまだありません</td></tr>
                ) : (
                  trackingClicks.map((click) => (
                    <tr key={click.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{click.source}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatDateTime(click.clicked_at)}</td>
                      <td className="px-4 py-3">
                        {click.matched_line_user_id ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">マッチ済</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">未マッチ</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-500">
                        {click.matched_line_user_id ? click.matched_line_user_id.substring(0, 16) + '...' : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── refコード タブ (従来) ── */}
      {trackingTab === 'ref' && <>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl p-5 border border-gray-100">
            <p className="text-sm text-gray-500">総友だち数</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{summary.totalFriends}</p>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-100">
            <p className="text-sm text-gray-500">ref 経由</p>
            <p className="text-3xl font-bold text-green-600 mt-1">{summary.friendsWithRef}</p>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-100">
            <p className="text-sm text-gray-500">ref 不明</p>
            <p className="text-3xl font-bold text-gray-400 mt-1">{summary.friendsWithoutRef}</p>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-100">
            <p className="text-sm text-gray-500">経路数</p>
            <p className="text-3xl font-bold text-blue-600 mt-1">{summary.routes.length}</p>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">
          読み込み中...
        </div>
      ) : !summary || summary.routes.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">
          流入経路がまだ登録されていません
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ref コード</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">経路名</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">友だち数</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">クリック数</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">最新追加日</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">URL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {summary.routes.map((route) => {
                const authUrl = `${WORKER_BASE}/auth/line?ref=${encodeURIComponent(route.refCode)}`
                const isExpanded = selectedRef === route.refCode
                return (
                  <>
                    <tr
                      key={route.refCode}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => handleRowClick(route.refCode)}
                    >
                      <td className="px-4 py-3 text-sm font-mono text-blue-600">{route.refCode}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{route.name}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">{route.friendCount}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600">{route.clickCount}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{formatDate(route.latestAt)}</td>
                      <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 truncate max-w-[180px]">{authUrl}</span>
                          <button
                            onClick={() => handleCopy(route.refCode)}
                            className="text-xs text-blue-500 hover:text-blue-700 shrink-0"
                          >
                            {copiedCode === route.refCode ? 'コピー済' : 'コピー'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${route.refCode}-detail`}>
                        <td colSpan={6} className="px-6 py-4 bg-gray-50">
                          {detailLoading ? (
                            <p className="text-sm text-gray-400">読み込み中...</p>
                          ) : detail && detail.friends.length > 0 ? (
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase mb-3">
                                このルートから追加した友だち ({detail.friends.length}人)
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {detail.friends.map((f) => (
                                  <div key={f.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100">
                                    <span className="text-sm text-gray-800 font-medium truncate">{f.displayName}</span>
                                    <span className="text-xs text-gray-400 ml-2 shrink-0">{formatDate(f.trackedAt)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-400">このルートから追加した友だちはまだいません</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      </>}
    </div>
  )
}
