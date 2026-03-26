'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import SequenceDetailClient from './sequence-detail-client'

function Inner() {
  const params = useSearchParams()
  const name = params.get('name')

  if (!name) {
    return <div className="p-8 text-center text-gray-500">シーケンス名が指定されていません</div>
  }

  return <SequenceDetailClient sequenceName={name} />
}

export default function SequencePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">読み込み中...</div>}>
      <Inner />
    </Suspense>
  )
}
