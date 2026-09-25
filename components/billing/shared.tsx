'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Line } from '@/lib/billing/domain'

export const yen = (value: number) => `¥${value.toLocaleString('ja-JP')}`
export function useBillingAction() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  async function run(body: object) {
    if (busy) return false
    setBusy(true)
    setMessage('')
    setError(false)
    try {
      const response = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? '処理に失敗しました')
      setMessage(
        result.message ??
          `${result.created}件作成しました（既存${result.skipped}件はスキップ）`,
      )
      router.refresh()
      return true
    } catch (e) {
      setError(true)
      setMessage(e instanceof Error ? e.message : '通信に失敗しました')
      return false
    } finally {
      setBusy(false)
    }
  }
  return {
    run,
    busy,
    feedback: message ? (
      <p
        role={error ? 'alert' : 'status'}
        className={`billing-notice ${error ? 'is-error' : ''}`}
      >
        {message}
      </p>
    ) : null,
  }
}
export function LinesEditor({
  lines,
  onChange,
  disabled = false,
}: {
  lines: Line[]
  onChange: (value: Line[]) => void
  disabled?: boolean
}) {
  return (
    <div className="billing-lines">
      <div className="billing-line billing-line--head">
        <span>品名</span>
        <span>数量</span>
        <span>単価（税抜・円）</span>
        <span />
      </div>
      {lines.map((line, index) => (
        <div className="billing-line" key={index}>
          <input
            aria-label={`品名 ${index + 1}`}
            disabled={disabled}
            required
            maxLength={120}
            value={line.name}
            onChange={(e) =>
              onChange(
                lines.map((l, i) =>
                  i === index ? { ...l, name: e.target.value } : l,
                ),
              )
            }
          />
          <input
            aria-label={`数量 ${index + 1}`}
            disabled={disabled}
            required
            type="number"
            min={1}
            max={100000}
            step={1}
            value={line.quantity}
            onChange={(e) =>
              onChange(
                lines.map((l, i) =>
                  i === index ? { ...l, quantity: Number(e.target.value) } : l,
                ),
              )
            }
          />
          <input
            aria-label={`単価 ${index + 1}`}
            disabled={disabled}
            required
            type="number"
            min={0}
            max={100000000}
            step={1}
            value={line.unitPrice}
            onChange={(e) =>
              onChange(
                lines.map((l, i) =>
                  i === index ? { ...l, unitPrice: Number(e.target.value) } : l,
                ),
              )
            }
          />
          <button
            type="button"
            disabled={disabled || lines.length <= 1}
            aria-label={`明細 ${index + 1} を削除`}
            onClick={() => onChange(lines.filter((_, i) => i !== index))}
          >
            ×
          </button>
        </div>
      ))}
      {!disabled && (
        <button
          type="button"
          className="billing-text-button"
          disabled={lines.length >= 100}
          onClick={() =>
            onChange([...lines, { name: '', quantity: 1, unitPrice: 0 }])
          }
        >
          ＋ 明細を追加
        </button>
      )}
    </div>
  )
}
