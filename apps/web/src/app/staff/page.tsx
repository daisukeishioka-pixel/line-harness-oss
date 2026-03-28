'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchApi } from '@/lib/api'
import Header from '@/components/layout/header'

type StaffMember = {
  id: string; name: string; email: string | null; role: string;
  isActive: boolean; createdAt: string; apiKey?: string;
}

const ROLES = [
  { value: 'owner', label: 'オーナー', color: '#dc2626' },
  { value: 'admin', label: '管理者', color: '#2563eb' },
  { value: 'staff', label: 'スタッフ', color: '#059669' },
]

export default function StaffPage() {
  const [members, setMembers] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: 'staff' })
  const [newKey, setNewKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchApi<{ success: boolean; data: StaffMember[] }>('/api/staff')
      if (res.success) setMembers(res.data)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    if (!form.name.trim()) { alert('名前を入力してください'); return }
    try {
      const res = await fetchApi<{ success: boolean; data: StaffMember }>('/api/staff', {
        method: 'POST', body: JSON.stringify(form),
      })
      if (res.success) {
        setNewKey(res.data.apiKey || null)
        setShowForm(false)
        setForm({ name: '', email: '', role: 'staff' })
        load()
      }
    } catch { alert('作成に失敗しました') }
  }

  const handleToggle = async (id: string, current: boolean) => {
    await fetchApi(`/api/staff/${id}`, { method: 'PUT', body: JSON.stringify({ isActive: !current }) })
    load()
  }

  const handleRegenerate = async (id: string, name: string) => {
    if (!confirm(`${name}のAPIキーを再発行しますか？現在のキーは無効になります。`)) return
    const res = await fetchApi<{ success: boolean; data: { apiKey: string } }>(`/api/staff/${id}/regenerate-key`, { method: 'POST' })
    if (res.success) setNewKey(res.data.apiKey)
    load()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('削除しますか？')) return
    const res = await fetchApi<{ success: boolean; error?: string }>(`/api/staff/${id}`, { method: 'DELETE' })
    if (!res.success) alert(res.error || 'エラー')
    load()
  }

  const roleInfo = (role: string) => ROLES.find(r => r.value === role) || ROLES[2]

  return (
    <div>
      <Header title="スタッフ管理" description="チームメンバーと権限の管理"
        action={<button onClick={() => { setShowForm(true); setNewKey(null) }} className="px-4 py-2 text-sm font-medium text-white rounded-lg" style={{ backgroundColor: '#06C755' }}>+ スタッフ追加</button>}
      />

      {/* 新しいAPIキー表示 */}
      {newKey && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-300 rounded-lg">
          <p className="text-sm font-semibold text-yellow-800 mb-2">APIキーが発行されました（この画面を閉じると再表示できません）</p>
          <code className="block p-2 bg-white border border-yellow-200 rounded text-sm font-mono break-all">{newKey}</code>
          <button onClick={() => { navigator.clipboard.writeText(newKey); alert('コピーしました') }} className="mt-2 text-xs text-yellow-700 hover:underline">コピー</button>
        </div>
      )}

      {/* 作成フォーム */}
      {showForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h3 className="text-sm font-semibold mb-4">新規スタッフ追加</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">名前 *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" placeholder="スタッフ名" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
              <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" placeholder="email@example.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">権限</label>
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg">
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {form.role === 'owner' && 'すべての機能にアクセス可能。LINEアカウント管理を含む。'}
                {form.role === 'admin' && '大部分の機能にアクセス可能。LINEアカウント管理は制限。'}
                {form.role === 'staff' && '配信・チャット・友だち管理など基本操作のみ。'}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreate} className="px-4 py-2 text-sm font-medium text-white rounded-lg" style={{ backgroundColor: '#06C755' }}>作成（APIキーを発行）</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg">キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">読み込み中...</div>
      ) : members.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">スタッフはまだ登録されていません</div>
      ) : (
        <div className="space-y-3">
          {members.map(m => {
            const ri = roleInfo(m.role)
            return (
              <div key={m.id} className={`bg-white rounded-lg border border-gray-200 p-4 ${!m.isActive ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: ri.color }}>
                      {m.name[0]}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900">{m.name}</p>
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold text-white" style={{ backgroundColor: ri.color }}>{ri.label}</span>
                        {!m.isActive && <span className="text-xs text-gray-400">無効</span>}
                      </div>
                      {m.email && <p className="text-xs text-gray-500">{m.email}</p>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleRegenerate(m.id, m.name)} className="text-xs text-blue-600 hover:underline">キー再発行</button>
                    <button onClick={() => handleToggle(m.id, m.isActive)} className="text-xs text-amber-600 hover:underline">{m.isActive ? '無効化' : '有効化'}</button>
                    <button onClick={() => handleDelete(m.id)} className="text-xs text-red-600 hover:underline">削除</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
