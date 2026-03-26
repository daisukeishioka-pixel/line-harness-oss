'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { Scenario, ScenarioTriggerType } from '@line-crm/shared'
import { api } from '@/lib/api'
import Header from '@/components/layout/header'
import ScenarioList from '@/components/scenarios/scenario-list'
import CcPromptButton from '@/components/cc-prompt-button'

const ccPrompts = [
  {
    title: '新しいシナリオを作成',
    prompt: `新しいシナリオ配信を作成してください。
1. ターゲット: [対象を指定]
2. トリガー: 友だち追加 / タグ変更 / 手動
3. ステップ数: [希望数]
4. メッセージ内容の提案もお願いします
各ステップの配信間隔も含めて構成してください。`,
  },
  {
    title: 'シナリオの効果分析',
    prompt: `現在のシナリオ配信の効果を分析してください。
1. 各シナリオの配信実績を確認
2. ステップごとの離脱率を分析
3. 改善が必要なシナリオを特定
具体的な改善案を提示してください。`,
  },
]

type ScenarioWithCount = Scenario & { stepCount?: number }

const triggerOptions: { value: ScenarioTriggerType; label: string }[] = [
  { value: 'friend_add', label: '友だち追加時' },
  { value: 'tag_added', label: 'タグ付与時' },
  { value: 'manual', label: '手動' },
]

interface CreateFormState {
  name: string
  description: string
  triggerType: ScenarioTriggerType
  triggerTagId: string
  isActive: boolean
}

// sequence_name → 表示名のマッピング
const sequenceDisplayNames: Record<string, string> = {
  '7day_challenge': '7日間 整体卒業チャレンジ',
}

interface SequenceCard {
  sequenceName: string
  displayName: string
  stepCount: number
  activeUsers: number
  completedUsers: number
}

export default function ScenariosPage() {
  const [scenarios, setScenarios] = useState<ScenarioWithCount[]>([])
  const [sequenceCards, setSequenceCards] = useState<SequenceCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<CreateFormState>({
    name: '',
    description: '',
    triggerType: 'friend_add',
    triggerTagId: '',
    isActive: true,
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [scenarioRes, stepsRes, activeRes, completedRes] = await Promise.all([
        api.scenarios.list(),
        api.stepSequences.stepMessages(),
        api.stepSequences.sequences('active'),
        api.stepSequences.sequences('completed'),
      ])

      if (scenarioRes.success) {
        setScenarios(scenarioRes.data)
      }

      // ステップ配信エンジンのシーケンスをカード化
      if (stepsRes.success && stepsRes.data) {
        const grouped = new Map<string, number>()
        for (const step of stepsRes.data) {
          grouped.set(step.sequence_name, (grouped.get(step.sequence_name) || 0) + 1)
        }

        const cards: SequenceCard[] = []
        for (const [name, count] of grouped) {
          cards.push({
            sequenceName: name,
            displayName: sequenceDisplayNames[name] || name,
            stepCount: count,
            activeUsers: activeRes.success ? activeRes.data.filter(s => s.sequence_name === name).length : 0,
            completedUsers: completedRes.success ? completedRes.data.filter(s => s.sequence_name === name).length : 0,
          })
        }
        setSequenceCards(cards)
      }
    } catch {
      setError('データの読み込みに失敗しました。もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setFormError('シナリオ名を入力してください')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const res = await api.scenarios.create({
        name: form.name,
        description: form.description || null,
        triggerType: form.triggerType,
        triggerTagId: form.triggerTagId || null,
        isActive: form.isActive,
      })
      if (res.success) {
        setShowCreate(false)
        setForm({ name: '', description: '', triggerType: 'friend_add', triggerTagId: '', isActive: true })
        loadData()
      } else {
        setFormError(res.error)
      }
    } catch {
      setFormError('作成に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (id: string, current: boolean) => {
    try {
      await api.scenarios.update(id, { isActive: !current })
      loadData()
    } catch {
      setError('ステータスの変更に失敗しました')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.scenarios.delete(id)
      loadData()
    } catch {
      setError('削除に失敗しました')
    }
  }

  return (
    <div>
      <Header
        title="シナリオ配信"
        action={
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 min-h-[44px] text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#06C755' }}
          >
            + 新規シナリオ
          </button>
        }
      />

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">新規シナリオを作成</h2>
          <div className="space-y-4 max-w-lg">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">シナリオ名 <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="例: 友だち追加ウェルカムシナリオ"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">説明</label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                rows={2}
                placeholder="シナリオの説明 (省略可)"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">トリガー</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                value={form.triggerType}
                onChange={(e) => setForm({ ...form, triggerType: e.target.value as ScenarioTriggerType })}
              >
                {triggerOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <label htmlFor="isActive" className="text-sm text-gray-600">作成後すぐに有効にする</label>
            </div>

            {formError && <p className="text-xs text-red-600">{formError}</p>}

            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-4 py-2 min-h-[44px] text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: '#06C755' }}
              >
                {saving ? '作成中...' : '作成'}
              </button>
              <button
                onClick={() => { setShowCreate(false); setFormError('') }}
                className="px-4 py-2 min-h-[44px] text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-5 animate-pulse space-y-3">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-100 rounded w-full" />
              <div className="flex gap-4">
                <div className="h-3 bg-gray-100 rounded w-24" />
                <div className="h-3 bg-gray-100 rounded w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* ステップ配信エンジン (7日間チャレンジ等) */}
          {sequenceCards.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">ステップ配信</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {sequenceCards.map((card) => (
                  <Link
                    key={card.sequenceName}
                    href={`/scenarios/sequence?name=${encodeURIComponent(card.sequenceName)}`}
                    className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-gray-900 leading-tight">
                        {card.displayName}
                      </span>
                      <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        自動配信
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      友だち追加をトリガーに、7日間のセルフケアチャレンジを自動配信します。
                    </p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <span>{card.stepCount}通</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>配信中: {card.activeUsers}人</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>完了: {card.completedUsers}人</span>
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 従来のシナリオ */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">シナリオ</h2>
            <ScenarioList
              scenarios={scenarios}
              onToggleActive={handleToggleActive}
              onDelete={handleDelete}
              loading={loading}
            />
          </div>
        </>
      )}

      <CcPromptButton prompts={ccPrompts} />
    </div>
  )
}
