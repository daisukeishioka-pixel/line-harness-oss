'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import type { ICommand, ExecuteState, TextAreaTextApi } from '@uiw/react-md-editor'
import { api } from '@/lib/api'
import Header from '@/components/layout/header'

const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false })

const CATEGORIES = [
  { value: 'セルフケア', label: 'セルフケア' },
  { value: 'ストレッチ', label: 'ストレッチ' },
  { value: 'お知らせ', label: 'お知らせ' },
  { value: 'コラム', label: 'コラム' },
]

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

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

function validateImageFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return '対応形式: JPG, PNG, WebP のみアップロード可能です'
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'ファイルサイズは5MB以下にしてください'
  }
  return null
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
  const [thumbnailUploading, setThumbnailUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const thumbnailInputRef = useRef<HTMLInputElement>(null)
  const editorImageInputRef = useRef<HTMLInputElement>(null)
  const editorInsertRef = useRef<((url: string) => void) | null>(null)

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

  // ── 画像アップロード共通処理 ──
  const uploadImage = async (file: File): Promise<string | null> => {
    const validationError = validateImageFile(file)
    if (validationError) {
      setError(validationError)
      return null
    }
    try {
      const res = await api.upload.image(file)
      if (res.success) {
        return res.data.url
      }
      setError('アップロードに失敗しました')
      return null
    } catch (e) {
      setError(e instanceof Error ? e.message : 'アップロードに失敗しました')
      return null
    }
  }

  // ── サムネイル画像アップロード ──
  const handleThumbnailUpload = async (file: File) => {
    setThumbnailUploading(true)
    setError('')
    const url = await uploadImage(file)
    if (url) {
      setForm((prev) => ({ ...prev, ogImageUrl: url }))
    }
    setThumbnailUploading(false)
  }

  const handleThumbnailFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleThumbnailUpload(file)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) {
      handleThumbnailUpload(file)
    }
  }

  // ── Markdownエディタ内画像挿入 ──
  const handleEditorImageUpload = async (file: File) => {
    setError('')
    const url = await uploadImage(file)
    if (url && editorInsertRef.current) {
      editorInsertRef.current(url)
    }
  }

  const handleEditorImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleEditorImageUpload(file)
    e.target.value = ''
  }

  // MDEditor custom command for image upload
  const imageUploadCommand: ICommand = {
    name: 'image-upload',
    keyCommand: 'image-upload',
    buttonProps: { 'aria-label': '画像をアップロード', title: '画像をアップロード' },
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
        <path d="M17 3H3a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm0 12H3V5h14v10zm-5-3.5l-2.5 3-1.75-2.25L5.5 15h9l-3.5-4.5z" />
        <path d="M8.5 9a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
      </svg>
    ),
    execute: (_state: ExecuteState, editorApi: TextAreaTextApi) => {
      editorInsertRef.current = (url: string) => {
        editorApi?.replaceSelection(`![画像](${url})`)
      }
      editorImageInputRef.current?.click()
    },
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

      {/* Hidden file inputs */}
      <input
        ref={thumbnailInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleThumbnailFileChange}
      />
      <input
        ref={editorImageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleEditorImageFileChange}
      />

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
              commands={undefined}
              extraCommands={[imageUploadCommand as never]}
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

            {/* サムネイル画像 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">サムネイル画像</label>
              <div className="flex gap-2 mb-2">
                <input
                  value={form.ogImageUrl}
                  onChange={(e) => setForm({ ...form, ogImageUrl: e.target.value })}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="https://example.com/image.jpg"
                />
                <button
                  type="button"
                  onClick={() => thumbnailInputRef.current?.click()}
                  disabled={thumbnailUploading}
                  className="px-3 py-2 text-xs font-medium text-white rounded-lg whitespace-nowrap disabled:opacity-50"
                  style={{ backgroundColor: '#06C755' }}
                >
                  {thumbnailUploading ? '...' : 'アップロード'}
                </button>
              </div>

              {/* ドラッグ＆ドロップエリア */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                  dragOver
                    ? 'border-green-400 bg-green-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                {thumbnailUploading ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    アップロード中...
                  </div>
                ) : form.ogImageUrl && /^https?:\/\//.test(form.ogImageUrl) ? (
                  <div>
                    <img
                      src={form.ogImageUrl}
                      alt="サムネイルプレビュー"
                      className="w-full h-32 object-cover rounded-lg"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                    <p className="mt-2 text-xs text-gray-400">画像をドラッグ&ドロップで差し替え</p>
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">
                    <p>画像をドラッグ&ドロップ</p>
                    <p className="text-xs mt-1">JPG, PNG, WebP（5MB以下）</p>
                  </div>
                )}
              </div>
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
