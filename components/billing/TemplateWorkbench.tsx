'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LinesEditor, yen } from './shared'
import { invoiceFilename, type Line } from '@/lib/billing/domain'
import { ACORU_TEMPLATE } from '@/lib/billing/template'

type Choice = {
  id: string
  name: string
  honorific: string
  subject: string
  lines: Line[]
}
export function TemplateWorkbench({
  today,
  customers,
}: {
  today: string
  customers: Choice[]
}) {
  const [kind, setKind] = useState('quotation')
  const [data, setData] = useState({
    name: '',
    honorific: '御中',
    subject: '',
    issueDate: today,
    dueDate: today,
    validUntil: new Date(
      new Date(`${today}T00:00:00Z`).getTime() + 30 * 86400000,
    )
      .toISOString()
      .slice(0, 10),
    delivery: '',
    conditions: '',
    sample: false,
    lines: [{ name: '', quantity: 1, unitPrice: 0, unit: '式' }] as Line[],
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<{
    url: string
    input: string
    name: string
  } | null>(null)
  const input = JSON.stringify({ kind, ...data })
  const current = preview?.input === input
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url)
    },
    [preview],
  )
  const subtotal = data.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
  return (
    <div className="billing">
      <div className="billing-heading">
        <div>
          <div className="billing-eyebrow">ACORU / DOCUMENTS</div>
          <h1>請求書・見積書テンプレート</h1>
          <p>
            {ACORU_TEMPLATE.name} v{ACORU_TEMPLATE.version}
          </p>
        </div>
        <Link className="btn" href="/billing">
          請求管理に戻る
        </Link>
      </div>
      <p className="billing-banner">
        PDFを作成・ダウンロードできます。この画面の入力内容は保存されず、請求履歴への登録やメール送信は行いません。
      </p>
      <div className="billing-detail-grid">
        <form
          className="billing-panel billing-form"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            setError('')
            try {
              const response = await fetch('/api/billing/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: input,
              })
              if (!response.ok) {
                const body = await response.json().catch(() => null)
                throw Error(body?.error ?? 'PDFを作成できませんでした')
              }
              setPreview({
                url: URL.createObjectURL(await response.blob()),
                input,
                name: kind === 'quotation'
                  ? `見積書_${data.issueDate}.pdf`
                  : invoiceFilename(data),
              })
            } catch (e) {
              setError(
                e instanceof Error ? e.message : 'PDFを作成できませんでした',
              )
            } finally {
              setBusy(false)
            }
          }}
        >
          <fieldset disabled={busy}>
            <div className="billing-form-grid">
              <label>
                帳票の種類
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="quotation">見積書</option>
                  <option value="invoice">請求書</option>
                </select>
              </label>
              <label>
                CRM顧客から入力
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const c = customers.find((c) => c.id === e.target.value)
                    if (c)
                      setData({
                        ...data,
                        name: c.name,
                        honorific: c.honorific,
                        subject: c.subject,
                        lines: c.lines,
                      })
                  }}
                >
                  <option value="">手入力</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                宛名
                <input
                  required
                  maxLength={120}
                  value={data.name}
                  onChange={(e) => setData({ ...data, name: e.target.value })}
                />
              </label>
              <label>
                敬称
                <input
                  required
                  maxLength={20}
                  value={data.honorific}
                  onChange={(e) =>
                    setData({ ...data, honorific: e.target.value })
                  }
                />
              </label>
              <label>
                件名
                <input
                  maxLength={100}
                  value={data.subject}
                  onChange={(e) =>
                    setData({ ...data, subject: e.target.value })
                  }
                />
              </label>
              <label>
                発行日
                <input
                  required
                  type="date"
                  value={data.issueDate}
                  onChange={(e) =>
                    setData({ ...data, issueDate: e.target.value })
                  }
                />
              </label>
              {kind === 'quotation' ? (
                <>
                  <label>
                    見積有効期限
                    <input
                      required
                      type="date"
                      min={data.issueDate}
                      value={data.validUntil}
                      onChange={(e) =>
                        setData({ ...data, validUntil: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    納期
                    <input
                      maxLength={100}
                      value={data.delivery}
                      onChange={(e) =>
                        setData({ ...data, delivery: e.target.value })
                      }
                    />
                  </label>
                </>
              ) : (
                <label>
                  支払期日
                  <input
                    required
                    type="date"
                    min={data.issueDate}
                    value={data.dueDate}
                    onChange={(e) =>
                      setData({ ...data, dueDate: e.target.value })
                    }
                  />
                </label>
              )}
            </div>
            <LinesEditor
              lines={data.lines}
              onChange={(lines) => setData({ ...data, lines })}
            />
            {kind === 'quotation' && (
              <label>
                見積条件
                <textarea
                  rows={3}
                  maxLength={300}
                  value={data.conditions}
                  onChange={(e) =>
                    setData({ ...data, conditions: e.target.value })
                  }
                />
              </label>
            )}
            <p className="billing-totals">
              合計（税込）{' '}
              <strong>{yen(subtotal + Math.floor(subtotal / 10))}</strong>
            </p>
            <label className="billing-check">
              <input
                type="checkbox"
                checked={data.sample}
                onChange={(e) => setData({ ...data, sample: e.target.checked })}
              />
              「仮作成・内容確認用」を表示する
            </label>
            <button className="btn btn--primary" type="submit">
              {busy ? '作成中…' : 'PDFを作成'}
            </button>
          </fieldset>
          {error && (
            <p role="alert" className="billing-banner">
              {error}
            </p>
          )}
        </form>
        <section className="billing-panel billing-form">
          <h2>PDFプレビュー</h2>
          {current && preview ? (
            <>
              <p role="status">PDFを作成しました。</p>
              <a className="btn" href={preview.url} download={preview.name}>
                PDFをダウンロード
              </a>
              <iframe
                title="帳票プレビュー"
                src={preview.url}
                style={{ width: '100%', height: 680, border: '1px solid #ddd' }}
              />
            </>
          ) : (
            <p>
              {preview
                ? '内容を変更しました。PDFを再作成してください。'
                : '入力後に「PDFを作成」を押すと表示されます。'}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
