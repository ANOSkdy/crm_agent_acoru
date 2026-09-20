'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function GenerateSummaryButton({ companyId }: { companyId: string }) {
  const router = useRouter()
  const requestPending = useRef(false)
  const [generating, setGenerating] = useState(false)
  const [refreshing, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [generated, setGenerated] = useState(false)
  const pending = generating || refreshing

  async function generate() {
    if (requestPending.current || pending) return
    requestPending.current = true
    setGenerating(true)
    setError('')
    setGenerated(false)

    try {
      const response = await fetch('/api/ai/summarize-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(typeof result.error === 'string' ? result.error : 'サマリーを生成できませんでした。')
      }
      setGenerated(true)
      startTransition(() => router.refresh())
    } catch (error) {
      setError(error instanceof Error && !(error instanceof TypeError) && !(error instanceof SyntaxError)
        ? error.message
        : 'サマリーを生成できませんでした。接続を確認して再度お試しください。')
    } finally {
      requestPending.current = false
      setGenerating(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={generate}
        disabled={pending}
        className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-wait"
      >
        {pending ? 'サマリー生成中…' : '顧客サマリー生成'}
      </button>
      <p role="status" className="text-xs text-gray-500">
        {pending ? '生成が完了すると、この画面に表示されます。' : generated ? 'サマリーを更新しました。' : ''}
      </p>
      {error && <p role="alert" className="max-w-sm text-xs text-red-600">{error}</p>}
    </div>
  )
}
