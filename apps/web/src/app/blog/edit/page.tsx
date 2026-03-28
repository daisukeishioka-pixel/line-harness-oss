'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { api } from '@/lib/api'
import Header from '@/components/layout/header'

const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false })

const CATEGORIES = [
  { value: 'セルフケア', label: 'セルフケア' },
  { value: 'ストレッチ', label: 'ストレッチ' },
  { value: 'お知らせ', label: 'お知らせ' },
  { value: 'コラム', label: 'コラム' },
]

type FormState = {
  title: string
  slug: string
  excerpt: string
  body: string
  category: string
  ogImageUrl: string
}

const defaultForm: FormState = {
  title: '',
  slug: '',
  excerpt: '',
  body: '',
  category: 'セルフケア',
  ogImageUrl: '',
}

function generateSlug() {
  return `post-${Date.now().toString(36)}`
}

function BlogEditInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const editId = searchParams.get('id')
  const isEdit = !!editId

  const [form, setForm] = useState<FormState>({ ...defaultForm, slug: generateSlug() })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [slugManual, setSlugManual] = useState(false)

  const loadPost = useCallback(async () => {
    if (!editId) return
    setLoading(true)
    setError('')
    try {
      const res = await api.blog.get(editId)
      if (res.success) {
        const p = res.data
        setForm({
          title: p.title,
          slug: p.slug,
          excerpt: p.excerpt,
          body: p.body,
          category: p.category,
          ogImageUrl: p.ogImageUrl ?? '',
        })
        setSlugManual(true)
      } else {
        setError('記事の取得に失敗しました')
      }
    } catch {
      setError('記事の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [editId])

  useEffect(() => { loadPost() }, [loadPost])

  const validate = (): string | null => {
    if (!form.title.trim()) return 'タイトルを入力してください'
    if (!form.slug.trim()) return 'スラッグを入力してください'
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug)) return 'スラッグは英小文字・数字・ハイフンのみ使用できます'
    if (form.slug === 'latest') return 'このスラッグは予約されています'
    if (!form.excerpt.trim()) return 'meta descriptionを入力してください'
    if (!form.body.trim()) return '本文を入力してください'
    return null
  }

  const handleSave = async (isPublished: boolean) => {
    const err = validate()
    if (err) { setError(err); return }

    setSaving(true)
    setError('')
    try {
      const payload = {
        slug: form.slug,
        title: form.title,
        excerpt: form.excerpt,
        body: form.body,
        category: form.category,
        ogImageUrl: form.ogImageUrl || null,
        isPublished,
      }

      if (isEdit) {
        const res = await api.blog.update(editId, payload)
        if (!res.success) { setError(res.error ?? '更新に失敗しました'); return }
      } else {
        const res = await api.blog.create(payload)
        if (!res.success) { setError(res.error ?? '作成に失敗しました'); return }
      }
      router.push('/blog')
    } catch (e) {
      const msg = e instanceof Error ? e.message : '保存に失敗しました'
      if (msg.includes('409') || msg.includes('Slug already exists')) {
        setError('このスラッグは既に使われています')
      } else {
        setError(msg)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleSlugChange = (value: string) => {
    setSlugManual(true)
    setForm({ ...form, slug: value.toLowerCase().replace(/[^a-z0-9-]/g, '') })
  }

  const handleRegenSlug = () => {
    setSlugManual(false)
    setForm({ ...form, slug: generateSlug() })
  }

  if (loading) {
    return (
      <div>
        <Header title="記事編集" />
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">読み込み中...</div>
      </div>
    )
  }

  return (
    <div>
      <Header
        title={isEdit ? '記事編集' : '新規記事作成'}
        description="著者: 田村"
        action={
          <Link href="/blog" className="text-sm text-gray-500 hover:text-gray-700">
            ← ブログ一覧に戻る
          </Link>
        }
      />

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* メインカラム */}
        <div className="lg:col-span-2 space-y-6">
          {/* タイトル・スラッグ */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">タイトル</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="記事のタイトル"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                スラッグ（URL）
                {!slugManual && <span className="ml-2 text-xs text-gray-400">自動生成</span>}
              </label>
              <div className="flex gap-2">
                <input
                  value={form.slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 font-mono"
                  placeholder="post-slug"
                />
                <button
                  type="button"
                  onClick={handleRegenSlug}
                  className="px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 whitespace-nowrap"
                >
                  再生成
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-400">英小文字・数字・ハイフンのみ</p>
            </div>
          </div>

          {/* Markdownエディタ */}
          <div className="bg-white rounded-lg border border-gray-200 p-6" data-color-mode="light">
            <label className="block text-sm font-medium text-gray-700 mb-2">本文（Markdown）</label>
            <MDEditor
              value={form.body}
              onChange={(val) => setForm({ ...form, body: val ?? '' })}
              height={400}
              preview="live"
            />
          </div>
        </div>

        {/* サイドバーカラム */}
        <div className="space-y-4">
          {/* 公開設定 */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">公開設定</h3>
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 min-h-[44px]"
            >
              {saving ? '保存中...' : '下書き保存'}
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              className="w-full px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 min-h-[44px]"
              style={{ backgroundColor: '#06C755' }}
            >
              {saving ? '保存中...' : '公開する'}
            </button>
          </div>

          {/* メタ情報 */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">メタ情報</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">カテゴリ</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">サムネイル画像URL</label>
              <input
                value={form.ogImageUrl}
                onChange={(e) => setForm({ ...form, ogImageUrl: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="https://example.com/image.jpg"
              />
              {form.ogImageUrl && /^https?:\/\//.test(form.ogImageUrl) && (
                <div className="mt-2 rounded-lg overflow-hidden border border-gray-200">
                  <img
                    src={form.ogImageUrl}
                    alt="サムネイルプレビュー"
                    className="w-full h-32 object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                meta description
                <span className="ml-2 text-xs text-gray-400">{form.excerpt.length}/160</span>
              </label>
              <textarea
                value={form.excerpt}
                onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="検索結果に表示される説明文（160文字以内推奨）"
              />
            </div>
          </div>

          {/* 著者情報 */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">著者</h3>
            <p className="text-sm text-gray-600">田村</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function BlogEditPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">読み込み中...</div>}>
      <BlogEditInner />
    </Suspense>
  )
}
