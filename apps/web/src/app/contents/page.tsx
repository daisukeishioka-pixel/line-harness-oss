'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchApi } from '@/lib/api'
import Header from '@/components/layout/header'

function extractYoutubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

type Content = {
  id: string
  title: string
  category: string
  description: string | null
  videoUrl: string | null
  thumbnailUrl: string | null
  duration: number | null
  isPublished: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

const CATEGORIES = [
  { value: 'neck_shoulder', label: '首・肩' },
  { value: 'back_chest', label: '背中・胸' },
  { value: 'pelvis_waist', label: '骨盤・腰' },
  { value: 'morning_routine', label: '朝ルーティン' },
  { value: 'archive', label: 'Liveアーカイブ' },
]

export default function ContentsPage() {
  const [items, setItems] = useState<Content[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    category: 'neck_shoulder',
    description: '',
    videoUrl: '',
    thumbnailUrl: '',
    duration: '',
    sortOrder: '0',
  })

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetchApi<{ success: boolean; data: Content[] }>('/api/contents')
      if (res.success) setItems(res.data)
    } catch {
      setError('コンテンツの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const resetForm = () => {
    setForm({ title: '', category: 'neck_shoulder', description: '', videoUrl: '', thumbnailUrl: '', duration: '', sortOrder: '0' })
    setEditId(null)
    setShowCreate(false)
  }

  const handleSubmit = async () => {
    if (!form.title) { setError('タイトルは必須です'); return }
    try {
      const body = {
        title: form.title,
        category: form.category,
        description: form.description || null,
        videoUrl: form.videoUrl || null,
        thumbnailUrl: form.thumbnailUrl || null,
        duration: form.duration ? Number(form.duration) : null,
        sortOrder: Number(form.sortOrder) || 0,
      }

      if (editId) {
        await fetchApi(`/api/contents/${editId}`, { method: 'PUT', body: JSON.stringify(body) })
      } else {
        await fetchApi('/api/contents', { method: 'POST', body: JSON.stringify(body) })
      }
      resetForm()
      await load()
    } catch {
      setError('保存に失敗しました')
    }
  }

  const startEdit = (item: Content) => {
    setForm({
      title: item.title,
      category: item.category,
      description: item.description || '',
      videoUrl: item.videoUrl || '',
      thumbnailUrl: item.thumbnailUrl || '',
      duration: item.duration ? String(item.duration) : '',
      sortOrder: String(item.sortOrder),
    })
    setEditId(item.id)
    setShowCreate(true)
  }

  const togglePublish = async (item: Content) => {
    await fetchApi(`/api/contents/${item.id}`, {
      method: 'PUT',
      body: JSON.stringify({ isPublished: !item.isPublished }),
    })
    await load()
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('削除しますか？')) return
    await fetchApi(`/api/contents/${id}`, { method: 'DELETE' })
    await load()
  }

  const thumbnailPreview = form.thumbnailUrl || null

  const handleVideoUrlChange = (url: string) => {
    const newForm = { ...form, videoUrl: url }
    const videoId = extractYoutubeId(url)
    if (videoId && !form.thumbnailUrl) {
      newForm.thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    }
    setForm(newForm)
  }

  const catLabel = (v: string) => CATEGORIES.find(c => c.value === v)?.label ?? v

  return (
    <div>
      <Header
        title="コンテンツ管理"
        description="セルフケア動画・Liveアーカイブの管理"
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
          <h3 className="text-sm font-bold text-gray-900 mb-4">{editId ? 'コンテンツ編集' : '新規コンテンツ'}</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">タイトル *</label>
              <input className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-green-500 focus:border-green-500" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">カテゴリ *</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">説明</label>
              <textarea className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">動画URL</label>
                <input className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="YouTube / Vimeo URL" value={form.videoUrl} onChange={e => handleVideoUrlChange(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">サムネイルURL</label>
                <input className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" value={form.thumbnailUrl} onChange={e => setForm({ ...form, thumbnailUrl: e.target.value })} />
                {thumbnailPreview && (
                  <img src={thumbnailPreview} alt="" className="mt-2 max-w-[320px] w-full rounded-lg bg-gray-100" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} onLoad={e => { (e.target as HTMLImageElement).style.display = 'block' }} />
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">再生時間（秒）</label>
                <input type="number" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">表示順</label>
                <input type="number" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: e.target.value })} />
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
        <div className="text-center py-12 text-gray-400 text-sm">コンテンツがまだありません</div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-3 min-w-0">
                  {item.thumbnailUrl && (
                    <img src={item.thumbnailUrl} alt="" className="w-20 h-14 rounded-lg object-cover flex-shrink-0 bg-gray-100" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{item.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">{catLabel(item.category)}</span>
                      {item.duration && <span className="text-xs text-gray-400">{Math.floor(item.duration / 60)}:{String(item.duration % 60).padStart(2, '0')}</span>}
                      <span className={`text-xs ${item.isPublished ? 'text-green-600' : 'text-gray-400'}`}>{item.isPublished ? '公開中' : '非公開'}</span>
                    </div>
                  </div>
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
