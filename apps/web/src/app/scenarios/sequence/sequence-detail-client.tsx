'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import Header from '@/components/layout/header'

const sequenceDisplayNames: Record<string, string> = {
  '7day_challenge': '7日間 整体卒業チャレンジ',
}

type StepMessage = {
  id: number
  sequence_name: string
  step_number: number
  delay_hours: number
  message_type: string
  content: string
  is_active: number
  condition_check: string | null
  created_at: string
  updated_at: string
}

type UserSequence = {
  id: number
  line_user_id: string
  sequence_name: string
  current_step: number
  status: string
  started_at: string
  last_sent_at: string | null
  completed_at: string | null
  created_at: string
  delivery_count: number
}

type DeliveryLog = {
  id: number
  line_user_id: string
  sequence_name: string
  step_number: number
  status: string
  error_message: string | null
  sent_at: string
}

function formatDelayHours(hours: number): string {
  if (hours === 0) return '即時'
  if (hours < 24) return `${hours}時間後`
  const d = Math.floor(hours / 24)
  const h = hours % 24
  return h === 0 ? `${d}日後` : `${d}日${h}時間後`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')
    return d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
  } catch {
    return dateStr
  }
}

const statusLabels: Record<string, { label: string; className: string }> = {
  active: { label: '配信中', className: 'bg-green-100 text-green-700' },
  completed: { label: '完了', className: 'bg-blue-100 text-blue-700' },
  stopped: { label: '停止', className: 'bg-gray-100 text-gray-500' },
  sent: { label: '送信済', className: 'bg-green-100 text-green-700' },
  failed: { label: '失敗', className: 'bg-red-100 text-red-700' },
}

type Tab = 'steps' | 'users' | 'logs'

export default function SequenceDetailClient({ sequenceName }: { sequenceName: string }) {
  const displayName = sequenceDisplayNames[sequenceName] || sequenceName

  const [tab, setTab] = useState<Tab>('steps')
  const [steps, setSteps] = useState<StepMessage[]>([])
  const [sequences, setSequences] = useState<UserSequence[]>([])
  const [logs, setLogs] = useState<DeliveryLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ステップ編集
  const [selectedStep, setSelectedStep] = useState<StepMessage | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editDelayHours, setEditDelayHours] = useState(0)
  const [editIsActive, setEditIsActive] = useState(true)
  const [saving, setSaving] = useState(false)

  // 配信状況フィルター
  const [statusFilter, setStatusFilter] = useState<string>('active')

  const loadSteps = useCallback(async () => {
    try {
      const res = await api.stepSequences.stepMessages(sequenceName)
      if (res.success) setSteps(res.data)
    } catch {
      setError('ステップメッセージの読み込みに失敗しました')
    }
  }, [sequenceName])

  const loadSequences = useCallback(async () => {
    try {
      const res = await api.stepSequences.sequences(statusFilter)
      if (res.success) {
        setSequences(res.data.filter(s => s.sequence_name === sequenceName))
      }
    } catch {
      setError('配信状況の読み込みに失敗しました')
    }
  }, [sequenceName, statusFilter])

  const loadLogs = useCallback(async () => {
    try {
      const res = await api.stepSequences.deliveryLogs(50)
      if (res.success) {
        setLogs(res.data.filter(l => l.sequence_name === sequenceName))
      }
    } catch {
      setError('配信ログの読み込みに失敗しました')
    }
  }, [sequenceName])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadSteps(), loadSequences(), loadLogs()]).finally(() => setLoading(false))
  }, [loadSteps, loadSequences, loadLogs])

  // タブ切替時にデータ再読み込み
  useEffect(() => {
    if (tab === 'users') loadSequences()
    if (tab === 'logs') loadLogs()
  }, [tab, loadSequences, loadLogs])

  // statusFilter変更時
  useEffect(() => {
    if (tab === 'users') loadSequences()
  }, [statusFilter, tab, loadSequences])

  const selectStep = (step: StepMessage) => {
    setSelectedStep(step)
    setEditContent(step.content)
    setEditDelayHours(step.delay_hours)
    setEditIsActive(step.is_active === 1)
  }

  const handleSaveStep = async () => {
    if (!selectedStep) return
    setSaving(true)
    setError('')
    try {
      const res = await api.stepSequences.updateStepMessage(selectedStep.id, {
        content: editContent,
        delay_hours: editDelayHours,
        is_active: editIsActive ? 1 : 0,
      })
      if (res.success) {
        await loadSteps()
        setSelectedStep(null)
      } else {
        setError('保存に失敗しました')
      }
    } catch {
      setError('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'steps', label: 'ステップ編集' },
    { key: 'users', label: '配信状況' },
    { key: 'logs', label: '配信ログ' },
  ]

  if (loading) {
    return (
      <div>
        <Header title={displayName} />
        <div className="bg-white rounded-lg border border-gray-200 p-8 animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3" />
          <div className="h-4 bg-gray-100 rounded w-2/3" />
          <div className="h-4 bg-gray-100 rounded w-1/2" />
        </div>
      </div>
    )
  }

  return (
    <div>
      <Header
        title={displayName}
        description={`ステップ配信 — ${steps.length}通`}
        action={
          <Link
            href="/scenarios"
            className="px-4 py-2 min-h-[44px] text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors inline-flex items-center"
          >
            ← シナリオ一覧
          </Link>
        }
      />

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-red-500 hover:text-red-700">×</button>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <div className="flex gap-0">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ステップ編集タブ */}
      {tab === 'steps' && (
        <div className="flex gap-6">
          {/* 左: ステップ一覧（タイムライン） */}
          <div className="w-1/2 min-w-0">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">ステップ一覧</h3>
              <div className="space-y-2">
                {steps.map((step, idx) => (
                  <button
                    key={step.id}
                    onClick={() => selectStep(step)}
                    className={`w-full text-left border rounded-lg p-3 transition-colors ${
                      selectedStep?.id === step.id
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300'
                    } ${step.is_active === 0 ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {/* タイムライン接続線 */}
                      <div className="relative flex flex-col items-center">
                        <span
                          className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white shrink-0"
                          style={{ backgroundColor: step.is_active ? '#06C755' : '#9ca3af' }}
                        >
                          {step.step_number}
                        </span>
                        {idx < steps.length - 1 && (
                          <div className="absolute top-6 w-0.5 h-3 bg-gray-200" />
                        )}
                      </div>
                      <span className="text-xs text-gray-500">{formatDelayHours(step.delay_hours)}</span>
                      {step.condition_check && (
                        <span className="text-xs bg-yellow-50 text-yellow-700 px-1.5 py-0.5 rounded">
                          条件: {step.condition_check}
                        </span>
                      )}
                      {step.is_active === 0 && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">無効</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 line-clamp-2 ml-8">
                      {step.content.substring(0, 80)}{step.content.length > 80 ? '...' : ''}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 右: 編集フォーム */}
          <div className="w-1/2 min-w-0">
            {selectedStep ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sticky top-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-4">
                  Day {selectedStep.step_number} を編集
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">配信テキスト</label>
                    <textarea
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                      rows={12}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                    />
                    <p className="text-xs text-gray-400 mt-1">{editContent.length}文字</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">遅延時間（時間）</label>
                    <input
                      type="number"
                      min={0}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      value={editDelayHours}
                      onChange={(e) => setEditDelayHours(Number(e.target.value))}
                    />
                    <p className="text-xs text-gray-400 mt-1">{formatDelayHours(editDelayHours)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditIsActive(!editIsActive)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        editIsActive ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          editIsActive ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <span className="text-sm text-gray-600">{editIsActive ? '有効' : '無効'}</span>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={handleSaveStep}
                      disabled={saving}
                      className="px-4 py-2 min-h-[44px] text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-opacity"
                      style={{ backgroundColor: '#06C755' }}
                    >
                      {saving ? '保存中...' : '保存'}
                    </button>
                    <button
                      onClick={() => setSelectedStep(null)}
                      className="px-4 py-2 min-h-[44px] text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                <p className="text-sm text-gray-400">左のステップを選択すると編集できます</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 配信状況タブ */}
      {tab === 'users' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {/* フィルター */}
          <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
            {(['active', 'completed', 'stopped'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  statusFilter === s
                    ? 'text-white'
                    : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                }`}
                style={statusFilter === s ? { backgroundColor: '#06C755' } : undefined}
              >
                {statusLabels[s]?.label || s}
              </button>
            ))}
            <span className="ml-auto text-xs text-gray-400">{sequences.length}件</span>
          </div>

          {/* テーブル */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-gray-500">LINE User ID</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500">現在のステップ</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500">ステータス</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500">開始日時</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500">最終配信</th>
                </tr>
              </thead>
              <tbody>
                {sequences.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      該当するユーザーはいません
                    </td>
                  </tr>
                ) : (
                  sequences.map((seq) => (
                    <tr key={seq.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">
                        {seq.line_user_id.substring(0, 16)}...
                      </td>
                      <td className="px-4 py-3 text-gray-700">Day {seq.current_step}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusLabels[seq.status]?.className || 'bg-gray-100 text-gray-500'}`}>
                          {statusLabels[seq.status]?.label || seq.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatDate(seq.started_at)}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatDate(seq.last_sent_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 配信ログタブ */}
      {tab === 'logs' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">配信ログ（最新50件）</h3>
            <button
              onClick={loadLogs}
              className="text-xs text-green-600 hover:text-green-700 px-3 py-1.5 rounded-md hover:bg-green-50 transition-colors"
            >
              更新
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-gray-500">LINE User ID</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500">ステップ</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500">ステータス</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500">送信日時</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500">エラー</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      配信ログはありません
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">
                        {log.line_user_id.substring(0, 16)}...
                      </td>
                      <td className="px-4 py-3 text-gray-700">Day {log.step_number}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusLabels[log.status]?.className || 'bg-gray-100 text-gray-500'}`}>
                          {statusLabels[log.status]?.label || log.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatDate(log.sent_at)}</td>
                      <td className="px-4 py-3 text-xs text-red-500">{log.error_message || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
