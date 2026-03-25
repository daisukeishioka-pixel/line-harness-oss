'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchApi } from '@/lib/api'
import Header from '@/components/layout/header'

type Schedule = {
  id: string
  title: string
  description: string | null
  scheduledAt: string
  liveUrl: string | null
  archiveUrl: string | null
  isPublished: boolean
  createdAt: string
  updatedAt: string
}

export default function SchedulesPage() {
  const [items, setItems] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    scheduledAt: '',
    liveUrl: '',
    archiveUrl: '',
  })

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetchApi<{ success: boolean; data: Schedule[] }>('/api/schedules')
      if (res.success) setItems(res.data)
    } catch {
      setError('スケジュールの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const resetForm = () => {
    setForm({ title: '', description: '', scheduledAt: '', liveUrl: '', archiveUrl: '' })
    setEditId(null)
    setShowCreate(false)
  }

  const handleSubmit = async () => {
    if (!form.title || !form.scheduledAt) { setError('タイトルと日時は必須です'); return }
    try {
      const body = {
        title: form.title,
        description: form.description || null,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        liveUrl: form.liveUrl || null,
        archiveUrl: form.archiveUrl || null,
      }

      if (editId) {
        await fetchApi(`/api/schedules/${editId}`, { method: 'PUT', body: JSON.stringify(body) })
      } else {
        await fetchApi('/api/schedules', { method: 'POST', body: JSON.stringify(body) })
      }
      resetForm()
      await load()
    } catch {
      setError('保存に失敗しました')
    }
  }

  const startEdit = (item: Schedule) => {
    const dt = new Date(item.scheduledAt)
    const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    setForm({
      title: item.title,
      description: item.description || '',
      scheduledAt: local,
      liveUrl: item.liveUrl || '',
      archiveUrl: item.archiveUrl || '',
    })
    setEditId(item.id)
    setShowCreate(true)
  }

  const togglePublish = async (item: Schedule) => {
    await fetchApi(`/api/schedules/${item.id}`, {
      method: 'PUT',
      body: JSON.stringify({ isPublished: !item.isPublished }),
    })
    await load()
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('削除しますか？')) return
    await fetchApi(`/api/schedules/${id}`, { method: 'DELETE' })
    await load()
  }

  const fmtDate = (iso: string) => {
    return new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const isPast = (iso: string) => new Date(iso) < new Date()

  return (
    <div>
      <Header
        title="Live配信スケジュール"
        description="配信スケジュールの管理"
        action={
          <button
            onClick={() => { resetForm(); setShowCreate(!showCreate) }}
            className="px-4 py-2 rounded-lg text-sm font-bold text-white min-h-[44px]"
            style={{ backgroundColor: '#06C755' }}
          >
            {showCreate ? 'キャンセル' : '+ 新規追加'}
          </button>
        }
      />

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
          <button onClick={() => setError('')} className="ml-2 font-bold">×</button>
        </div>
      )}

      {showCreate && (
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-sm font-bold text-gray-900 mb-4">{editId ? 'スケジュール編集' : '新規スケジュール'}</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">タイトル *</label>
              <input className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-green-500 focus:border-green-500" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">配信日時 *</label>
              <input type="datetime-local" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" value={form.scheduledAt} onChange={e => setForm({ ...form, scheduledAt: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">説明</label>
              <textarea className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Live配信URL</label>
                <input className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="YouTube Live等のURL" value={form.liveUrl} onChange={e => setForm({ ...form, liveUrl: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">アーカイブURL</label>
                <input className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="配信後に追加" value={form.archiveUrl} onChange={e => setForm({ ...form, archiveUrl: e.target.value })} />
              </div>
            </div>
            <button onClick={handleSubmit} className="px-6 py-2 rounded-lg text-sm font-bold text-white min-h-[44px]" style={{ backgroundColor: '#06C755' }}>
              {editId ? '更新' : '作成'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">スケジュールがまだありません</div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id} className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 ${isPast(item.scheduledAt) ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900">{item.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-medium" style={{ color: '#d4a853' }}>{fmtDate(item.scheduledAt)}</span>
                    <span className={`text-xs ${item.isPublished ? 'text-green-600' : 'text-gray-400'}`}>{item.isPublished ? '公開' : '非公開'}</span>
                    {isPast(item.scheduledAt) && <span className="text-xs text-gray-400">終了</span>}
                  </div>
                  {item.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description}</p>}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => togglePublish(item)} className="px-2 py-1 text-xs rounded hover:bg-gray-100">{item.isPublished ? '非公開' : '公開'}</button>
                  <button onClick={() => startEdit(item)} className="px-2 py-1 text-xs text-blue-600 rounded hover:bg-blue-50">編集</button>
                  <button onClick={() => handleDelete(item.id)} className="px-2 py-1 text-xs text-red-500 rounded hover:bg-red-50">削除</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
