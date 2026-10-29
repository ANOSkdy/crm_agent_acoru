'use client'
import { useState } from 'react'
import Link from 'next/link'
import { type Invoice, emailContent, statusLabels } from '@/lib/billing/domain'
import { LinesEditor, useBillingAction, yen } from './shared'

export function InvoiceEditor({
  invoice,
  live,
  allowReal,
}: {
  invoice: Invoice
  live: boolean
  allowReal: boolean
}) {
  const [data, setData] = useState(invoice.document)
  const [status, setStatus] = useState(
    invoice.status === 'held' ? 'held' : 'draft',
  )
  const action = useBillingAction()
  const editable = ['draft', 'simulated', 'held'].includes(invoice.status)
  const dirty =
    JSON.stringify(data) !== JSON.stringify(invoice.document) ||
    status !== (invoice.status === 'held' ? 'held' : 'draft')
  const email = emailContent(invoice)
  const subtotal = data.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
  const tax = Math.floor(subtotal / 10)
  const canDeliver =
    live &&
    ['draft', 'simulated'].includes(invoice.status) &&
    !invoice.document.reviewNote &&
    !invoice.document.provisional &&
    invoice.billing_enabled !== false &&
    !dirty
  return (
    <>
      <div className="billing-heading">
        <div>
          <div className="billing-eyebrow">{invoice.id}</div>
          <h1>{invoice.document.name}</h1>
          <p>
            {invoice.period.replace('-', '年')}月分 / 請求日{' '}
            {invoice.document.issueDate}
          </p>
        </div>
        <span className={`billing-status ${invoice.status}`}>
          {statusLabels[invoice.status]}
        </span>
      </div>
      {invoice.document.reviewNote && (
        <p className="billing-banner">
          {invoice.document.reviewNote}
          。当時の宛名を保存し、この請求書の再送は停止しています。
        </p>
      )}
      {invoice.company_id && (
        <p>
          <Link href={`/companies/${invoice.company_id}`}>
            CRMの顧客情報を開く →
          </Link>
        </p>
      )}
      {invoice.document.provisional && (
        <p className="billing-banner">
          仮作成した請求書です。件名・明細・金額を確認し、「送信待ち」に変更して保存してください。
        </p>
      )}
      {invoice.billing_enabled === false && (
        <p className="billing-banner">
          この顧客の請求は無効です。送信は停止しています。
        </p>
      )}
      {invoice.document.imported && invoice.status === 'sent' && (
        <p className="billing-notice">
          旧システムの送信済み記録です。PDFは移行データからの再生成で、当時の送付原本ではありません。
        </p>
      )}
      {!live && (
        <p className="billing-banner">
          メール送信は停止中です。
        </p>
      )}
      {action.feedback}
      <div className="billing-detail-grid">
        <form
          className="billing-panel billing-form"
          onSubmit={(e) => {
            e.preventDefault()
            action.run({
              action: 'invoice',
              id: invoice.id,
              version: invoice.version,
              name: data.name,
              subject: data.subject,
              email: data.email,
              honorific: data.honorific,
              dueDate: data.dueDate,
              lines: data.lines,
              status,
            })
          }}
        >
          <h2>請求内容</h2>
          <fieldset disabled={!editable || action.busy}>
            <div className="billing-form-grid">
              <label>
                件名
                <input
                  maxLength={100}
                  value={data.subject ?? ''}
                  onChange={(e) =>
                    setData({ ...data, subject: e.target.value })
                  }
                />
              </label>
              <label>
                請求先名
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
                送付先メールアドレス
                <input
                  required
                  type="email"
                  value={data.email}
                  onChange={(e) => setData({ ...data, email: e.target.value })}
                />
                <small>
                  {allowReal
                    ? 'この請求書に保存された宛先'
                    : '送付先の登録は停止中です'}
                </small>
              </label>
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
            </div>
            <LinesEditor
              lines={data.lines}
              onChange={(lines) => setData({ ...data, lines })}
              disabled={!editable || action.busy}
            />
            <div className="billing-totals">
              <span>
                小計 <strong>{yen(subtotal)}</strong>
              </span>
              <span>
                消費税（10%）<strong>{yen(tax)}</strong>
              </span>
              <span className="grand">
                合計 <strong>{yen(subtotal + tax)}</strong>
              </span>
            </div>
            <label>
              送信状態
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="draft">送信待ち</option>
                <option value="held">保留（自動送信しない）</option>
              </select>
            </label>
            {editable && (
              <button
                className="btn btn--primary"
                type="submit"
                disabled={!dirty}
              >
                変更を保存
              </button>
            )}
          </fieldset>
        </form>
        <aside className="billing-panel billing-form">
          <h2>PDFと送付内容</h2>
          <p>PDFとメールには、保存済みの請求内容を使用します。</p>
          <a
            className="btn"
            href={`/api/billing/pdf/${invoice.id}`}
            target="_blank"
            rel="noreferrer"
          >
            PDFを開く ↗
          </a>
          <div className="billing-email-preview">
            <strong>{email.subject}</strong>
            <pre>{email.text}</pre>
          </div>
          {dirty && (
            <p className="billing-notice">
              変更を保存してから送信してください。
            </p>
          )}
          <button
            className="btn btn--primary"
            disabled={!canDeliver || action.busy}
            onClick={() => {
              if (
                window.confirm(
                  `${invoice.document.name}（${invoice.document.email}）へ ${yen(invoice.total)} の請求書を送信しますか？`,
                )
              )
                action.run({ action: 'deliver', id: invoice.id })
            }}
          >
            {action.busy
              ? '処理中…'
              : 'この請求書を送信'}
          </button>
          <p className="billing-footnote">
            送信後は内容と宛先を固定し、重複送信を防ぎます。
          </p>
        </aside>
      </div>
    </>
  )
}
