'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import Header from '@/components/layout/header'

type BlogPost = {
  id: string
  slug: string
  title: string
  excerpt: string
  category: string
  ogImageUrl: string | null
  isPublished: boolean
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

const CATEGORIES: Record<string, { label: string; color: string }> = {
  'セルフケア': { label: 'セルフケア', color: '#4caf50' },
  'ストレッチ': { label: 'ストレッチ', color: '#66bb6a' },
  'お知らせ': { label: 'お知らせ', color: '#2e7d32' },
  'コラム': { label: 'コラム', color: '#81c784' },
}

export default function BlogPage() {
  const [items, setItems] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.blog.list()
      if (res.success) setItems(res.data.items)
      else setError(res.error)
    } catch {
      setError('ブログ記事の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleToggle = async (id: string, current: boolean) => {
    setTogglingId(id)
    try {
      await api.blog.update(id, { isPublished: !current })
      await load()
    } catch {
      setError('公開状態の更新に失敗しました')
    } finally {
      setTogglingId(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('この記事を削除しますか？')) return
    try {
      await api.blog.delete(id)
      await load()
    } catch {
      setError('記事の削除に失敗しました')
    }
  }

  const formatDate = (date: string | null) => {
    if (!date) return '—'
    return new Date(date).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  return (
    <div>
      <Header
        title="ブログ管理"
        description="ブログ記事の作成・編集・公開管理"
        action={
          <Link
            href="/blog/edit"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white rounded-lg min-h-[44px]"
            style={{ backgroundColor: '#06C755' }}
          >
            + 新規作成
          </Link>
        }
      />

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="px-4 py-4 border-b border-gray-100 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-48" />
                  <div className="h-2 bg-gray-100 rounded w-32" />
                </div>
                <div className="h-6 bg-gray-100 rounded w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <p className="text-gray-500 text-sm">ブログ記事はまだありません</p>
          <Link
            href="/blog/edit"
            className="inline-flex items-center mt-4 px-4 py-2 text-sm font-medium text-white rounded-lg"
            style={{ backgroundColor: '#06C755' }}
          >
            最初の記事を作成する
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">記事</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">カテゴリ</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">状態</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">投稿日</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => {
                  const cat = CATEGORIES[item.category] ?? { label: item.category, color: '#999' }
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold text-gray-900">{item.title}</div>
                        <div className="text-xs text-gray-400 mt-0.5">/{item.slug}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-block px-2 py-0.5 rounded text-xs font-semibold text-white"
                          style={{ backgroundColor: cat.color }}
                        >
                          {cat.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggle(item.id, item.isPublished)}
                          disabled={togglingId === item.id}
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            item.isPublished
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          } ${togglingId === item.id ? 'opacity-50' : ''}`}
                        >
                          {item.isPublished ? '公開' : '下書き'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatDate(item.publishedAt ?? item.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-3 justify-end">
                          <Link
                            href={`/blog/edit?id=${item.id}`}
                            className="text-xs font-medium text-green-600 hover:underline"
                          >
                            編集
                          </Link>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="text-xs font-medium text-red-600 hover:underline"
                          >
                            削除
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
