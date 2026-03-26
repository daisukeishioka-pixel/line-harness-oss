'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchApi } from '@/lib/api'
import Header from '@/components/layout/header'

type AutoReply = {
  id: string
  keyword: string
  match_type: string
  response_type: string
  response_content: string
  is_active: number
  created_at: string
}

const matchTypeLabels: Record<string, string> = {
  exact: '完全一致',
  contains: '部分一致',
  starts_with: '前方一致',
}

const matchTypeOptions = [
  { value: 'contains', label: '部分一致' },
  { value: 'exact', label: '完全一致' },
  { value: 'starts_with', label: '前方一致' },
]

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
  } catch { return iso }
}

export default function AutoRepliesPage() {
  const [rules, setRules] = useState<AutoReply[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 作成フォーム
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ keyword: '', match_type: 'contains', response_content: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // 編集
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ keyword: '', match_type: '', response_content: '', is_active: 1 })
  const [editSaving, setEditSaving] = useState(false)

  const loadRules = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetchApi<{ success: boolean; data: AutoReply[] }>('/api/admin/auto-replies')
      if (res.success) setRules(res.data)
      else setError('読み込みに失敗しました')
    } catch {
      setError('読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRules() }, [loadRules])

  const handleCreate = async () => {
    if (!createForm.keyword.trim() || !createForm.response_content.trim()) {
      setFormError('キーワードと返信内容を入力してください')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const res = await fetchApi<{ success: boolean }>('/api/admin/auto-replies', {
        method: 'POST',
        body: JSON.stringify({
          keyword: createForm.keyword,
          match_type: createForm.match_type,
          response_type: 'text',
          response_content: createForm.response_content,
        }),
      })
      if (res.success) {
        setShowCreate(false)
        setCreateForm({ keyword: '', match_type: 'contains', response_content: '' })
        loadRules()
      } else {
        setFormError('作成に失敗しました')
      }
    } catch {
      setFormError('作成に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (rule: AutoReply) => {
    setEditingId(rule.id)
    setEditForm({
      keyword: rule.keyword,
      match_type: rule.match_type,
      response_content: rule.response_content,
      is_active: rule.is_active,
    })
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    setEditSaving(true)
    try {
      await fetchApi(`/api/admin/auto-replies/${editingId}`, {
        method: 'PUT',
        body: JSON.stringify({
          keyword: editForm.keyword,
          match_type: editForm.match_type,
          response_content: editForm.response_content,
          is_active: editForm.is_active,
        }),
      })
      setEditingId(null)
      loadRules()
    } catch {
      setError('保存に失敗しました')
    } finally {
      setEditSaving(false)
    }
  }

  const handleToggleActive = async (rule: AutoReply) => {
    try {
      await fetchApi(`/api/admin/auto-replies/${rule.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: rule.is_active ? 0 : 1 }),
      })
      loadRules()
    } catch {
      setError('ステータスの変更に失敗しました')
    }
  }

  const handleDelete = async (rule: AutoReply) => {
    if (!confirm(`「${rule.keyword}」の自動応答ルールを削除してもよいですか？`)) return
    try {
      await fetchApi(`/api/admin/auto-replies/${rule.id}`, { method: 'DELETE' })
      loadRules()
    } catch {
      setError('削除に失敗しました')
    }
  }

  return (
    <div>
      <Header
        title="自動応答"
        description="キーワードに基づいてメッセージを自動返信します"
        action={
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 min-h-[44px] text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#06C755' }}
          >
            + 新規ルール
          </button>
        }
      />

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-red-500 hover:text-red-700">×</button>
        </div>
      )}

      {/* 作成フォーム */}
      {showCreate && (
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">新規ルールを作成</h2>
          <div className="space-y-4 max-w-lg">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">キーワード <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="例: 料金"
                value={createForm.keyword}
                onChange={(e) => setCreateForm({ ...createForm, keyword: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">マッチタイプ</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                value={createForm.match_type}
                onChange={(e) => setCreateForm({ ...createForm, match_type: e.target.value })}
              >
                {matchTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">返信内容 <span className="text-red-500">*</span></label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                rows={6}
                placeholder="自動返信するメッセージを入力..."
                value={createForm.response_content}
                onChange={(e) => setCreateForm({ ...createForm, response_content: e.target.value })}
              />
              <p className="text-xs text-gray-400 mt-1">{createForm.response_content.length}文字</p>
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

      {/* ルール一覧 */}
      {loading ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="h-4 bg-gray-200 rounded w-20" />
              <div className="h-4 bg-gray-100 rounded w-16" />
              <div className="h-4 bg-gray-100 rounded flex-1" />
            </div>
          ))}
        </div>
      ) : rules.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500">自動応答ルールがありません。「+ 新規ルール」から追加してください。</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">キーワード</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">マッチ</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">返信内容</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">有効</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">作成日</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rules.map((rule) => (
                  editingId === rule.id ? (
                    // 編集モード
                    <tr key={rule.id} className="bg-green-50">
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                          value={editForm.keyword}
                          onChange={(e) => setEditForm({ ...editForm, keyword: e.target.value })}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <select
                          className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                          value={editForm.match_type}
                          onChange={(e) => setEditForm({ ...editForm, match_type: e.target.value })}
                        >
                          {matchTypeOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <textarea
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                          rows={3}
                          value={editForm.response_content}
                          onChange={(e) => setEditForm({ ...editForm, response_content: e.target.value })}
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setEditForm({ ...editForm, is_active: editForm.is_active ? 0 : 1 })}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${editForm.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${editForm.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatDate(rule.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={handleSaveEdit}
                            disabled={editSaving}
                            className="text-xs font-medium text-white px-3 py-1.5 rounded-md transition-opacity disabled:opacity-50 min-h-[44px] flex items-center"
                            style={{ backgroundColor: '#06C755' }}
                          >
                            {editSaving ? '保存中...' : '保存'}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs font-medium text-gray-600 px-3 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 transition-colors min-h-[44px] flex items-center"
                          >
                            取消
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    // 表示モード
                    <tr key={rule.id} className={`hover:bg-gray-50 ${rule.is_active ? '' : 'opacity-50'}`}>
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-gray-900">{rule.keyword}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-600">
                          {matchTypeLabels[rule.match_type] || rule.match_type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-600 truncate max-w-[300px]">
                          {rule.response_content.substring(0, 50)}{rule.response_content.length > 50 ? '...' : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleToggleActive(rule)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${rule.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${rule.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatDate(rule.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => startEdit(rule)}
                            className="text-xs font-medium text-green-600 hover:text-green-700 px-2 py-1 rounded hover:bg-green-50 transition-colors min-h-[44px] flex items-center"
                          >
                            編集
                          </button>
                          <button
                            onClick={() => handleDelete(rule)}
                            className="text-xs font-medium text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors min-h-[44px] flex items-center"
                          >
                            削除
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
