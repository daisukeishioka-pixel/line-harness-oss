'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchApi } from '@/lib/api'
import Header from '@/components/layout/header'

type NewsItem = {
  id: string; title: string; body: string; category: string;
  isPublished: boolean; publishedAt: string; createdAt: string;
}

const CATEGORIES = [
  { value: 'info', label: 'お知らせ', color: '#1a6b5a' },
  { value: 'event', label: 'イベント', color: '#d4a853' },
  { value: 'update', label: '更新', color: '#2563eb' },
  { value: 'campaign', label: 'キャンペーン', color: '#dc2626' },
]

export default function NewsPage() {
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', body: '', category: 'info' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchApi<{ success: boolean; data: NewsItem[] }>('/api/news?published=false')
      if (res.success) setItems(res.data)
    } catch { setError('ニュースの取得に失敗しました') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const resetForm = () => { setForm({ title: '', body: '', category: 'info' }); setEditId(null); setShowForm(false) }

  const handleSave = async () => {
    if (!form.title.trim() || !form.body.trim()) { alert('タイトルと本文を入力してください'); return }
    try {
      if (editId) {
        await fetchApi(`/api/news/${editId}`, { method: 'PUT', body: JSON.stringify(form) })
      } else {
        await fetchApi('/api/news', { method: 'POST', body: JSON.stringify(form) })
      }
      resetForm(); load()
    } catch { alert('保存に失敗しました') }
  }

  const handleEdit = (item: NewsItem) => {
    setForm({ title: item.title, body: item.body, category: item.category })
    setEditId(item.id); setShowForm(true)
  }

  const handleToggle = async (id: string, current: boolean) => {
    await fetchApi(`/api/news/${id}`, { method: 'PUT', body: JSON.stringify({ isPublished: !current }) })
    load()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('削除しますか？')) return
    await fetchApi(`/api/news/${id}`, { method: 'DELETE' })
    load()
  }

  const catInfo = (cat: string) => CATEGORIES.find(c => c.value === cat) || CATEGORIES[0]

  return (
    <div>
      <Header title="ニュース管理" description="会員向けのお知らせ・イベント告知"
        action={<button onClick={() => { resetForm(); setShowForm(true) }} className="px-4 py-2 text-sm font-medium text-white rounded-lg" style={{ backgroundColor: '#06C755' }}>+ 新規作成</button>}
      />

      {showForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h3 className="text-sm font-semibold mb-4">{editId ? '編集' : '新規作成'}</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">カテゴリ</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg">
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">タイトル</label>
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" placeholder="ニュースのタイトル" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">本文</label>
              <textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} rows={4} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" placeholder="ニュースの本文" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white rounded-lg" style={{ backgroundColor: '#06C755' }}>{editId ? '更新' : '公開'}</button>
              <button onClick={resetForm} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg">キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">読み込み中...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">ニュースはまだありません</div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const cat = catInfo(item.category)
            return (
              <div key={item.id} className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold text-white" style={{ backgroundColor: cat.color }}>{cat.label}</span>
                      {!item.isPublished && <span className="text-xs text-gray-400">非公開</span>}
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.body}</p>
                    <p className="text-xs text-gray-400 mt-2">{new Date(item.publishedAt).toLocaleDateString('ja-JP')}</p>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button onClick={() => handleToggle(item.id, item.isPublished)} className="text-xs text-blue-600 hover:underline">{item.isPublished ? '非公開' : '公開'}</button>
                    <button onClick={() => handleEdit(item)} className="text-xs text-green-600 hover:underline">編集</button>
                    <button onClick={() => handleDelete(item.id)} className="text-xs text-red-600 hover:underline">削除</button>
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
