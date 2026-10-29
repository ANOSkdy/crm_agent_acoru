'use client'
import { useState } from 'react'
import Link from 'next/link'
import { type Customer, type CrmChoice, terms } from '@/lib/billing/domain'
import { LinesEditor, useBillingAction, yen } from './shared'

export function CrmBillingCustomers({
  customers,
  choices,
  allowReal,
  initialCompanyId,
}: {
  customers: Customer[]
  choices: CrmChoice[]
  allowReal: boolean
  initialCompanyId?: string
}) {
  const [editing, setEditing] = useState<Customer | null>(
    customers.find((c) => c.companyId === initialCompanyId) ?? null,
  )
  return (
    <>
      <div className="billing-toolbar">
        <p>
          内容を確認済みにして請求を有効化すると、今月分から送信待ちで作成します。
        </p>
        <Link className="btn" href="/companies">
          顧客マスタを開く →
        </Link>
      </div>
      {editing && (
        <CrmBillingForm
          key={`${editing.id}-${editing.version}`}
          initial={editing}
          choice={choices.find((c) => c.id === editing.companyId)}
          allowReal={allowReal}
          onClose={() => setEditing(null)}
        />
      )}
      <section className="billing-panel billing-table-wrap">
        <table>
          <thead>
            <tr>
              <th>CRM顧客</th>
              <th>請求</th>
              <th>請求担当者</th>
              <th>支払条件</th>
              <th className="numeric">月次設定（税抜）</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.companyId ? (
                    <Link
                      className="billing-company"
                      href={`/companies/${c.companyId}`}
                    >
                      {c.name}
                    </Link>
                  ) : (
                    <strong>{c.name}</strong>
                  )}
                  <small>
                    {c.companyId ? 'CRM連携済み' : '旧請求データ・未連携'}
                  </small>
                </td>
                <td>
                  <span
                    className={`billing-status ${c.billingEnabled ? 'draft' : 'held'}`}
                  >
                    {c.billingEnabled ? '有効' : '無効'}
                  </span>
                </td>
                <td>
                  {choices
                    .find((p) => p.id === c.companyId)
                    ?.contacts.find((t) => t.id === c.contactId)?.name ??
                    '未選択'}
                </td>
                <td>{c.paymentTerm}</td>
                <td className="numeric">
                  {yen(
                    c.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
                  )}
                  <small>
                    {c.templateConfirmed ? '内容確認済み' : '要確認・仮設定'}
                  </small>
                </td>
                <td>
                  <button
                    className="billing-text-button"
                    onClick={() => setEditing(c)}
                  >
                    請求設定
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}
function CrmBillingForm({
  initial,
  choice,
  allowReal,
  onClose,
}: {
  initial: Customer
  choice?: CrmChoice
  allowReal: boolean
  onClose: () => void
}) {
  const [data, setData] = useState(initial)
  const action = useBillingAction()
  return (
    <form
      className="billing-panel billing-form"
      onSubmit={async (e) => {
        e.preventDefault()
        if (
          await action.run({
            action: 'customer',
            data,
            version: initial.version,
          })
        )
          onClose()
      }}
    >
      <div className="billing-panel-head">
        <h2>{initial.name}の請求設定</h2>
        <button type="button" className="billing-text-button" onClick={onClose}>
          閉じる
        </button>
      </div>
      <fieldset disabled={action.busy}>
        <div className="billing-form-grid">
          <label>
            請求の有効／無効
            <select
              value={data.billingEnabled ? 'enabled' : 'disabled'}
              onChange={(e) =>
                setData({
                  ...data,
                  billingEnabled: e.target.value === 'enabled',
                  status: e.target.value === 'enabled' ? '契約中' : '契約前',
                })
              }
            >
              <option value="disabled">無効</option>
              <option value="enabled">有効（今月分から作成）</option>
            </select>
          </label>
          <label>
            請求担当者
            <select
              value={data.contactId ?? ''}
              onChange={(e) =>
                setData({ ...data, contactId: e.target.value || null })
              }
            >
              <option value="">未選択</option>
              {choice?.contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.hasEmail ? '' : '（メール未登録）'}
                </option>
              ))}
            </select>
            <small>
              {allowReal
                ? '今後作成する請求書の宛先には「送付先メールアドレス」を使用します'
                : '送付先の登録は停止中です'}
            </small>
          </label>
          <label>
            送付先メールアドレス
            <input
              required
              type="email"
              value={data.email}
              onChange={(e) => setData({ ...data, email: e.target.value })}
            />
          </label>
          <label>
            支払条件
            <select
              value={data.paymentTerm}
              onChange={(e) =>
                setData({
                  ...data,
                  paymentTerm: e.target.value as Customer['paymentTerm'],
                })
              }
            >
              {terms.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            件名
            <input
              maxLength={100}
              value={data.subject ?? ''}
              onChange={(e) => setData({ ...data, subject: e.target.value })}
            />
          </label>
          <label>
            敬称
            <input
              required
              maxLength={20}
              value={data.honorific}
              onChange={(e) => setData({ ...data, honorific: e.target.value })}
            />
          </label>
          <label>
            参照案件
            <select
              value={data.sourceDealId ?? ''}
              onChange={(e) =>
                setData({ ...data, sourceDealId: e.target.value || null })
              }
            >
              <option value="">未選択</option>
              {choice?.deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}（{yen(d.amount)}）
                </option>
              ))}
            </select>
          </label>
          <div>
            <button
              type="button"
              className="btn"
              disabled={!data.sourceDealId}
              onClick={() => {
                const deal = choice?.deals.find(
                  (d) => d.id === data.sourceDealId,
                )
                if (deal)
                  setData({
                    ...data,
                    subject: deal.title,
                    lines: [
                      {
                        name: deal.title,
                        quantity: 1,
                        unitPrice: deal.amount,
                        unit: '式',
                      },
                    ],
                    templateConfirmed: false,
                  })
              }}
            >
              案件から明細を仮入力
            </button>
            <p className="billing-footnote">
              案件金額が月額かどうかを確認して調整してください。
            </p>
          </div>
        </div>
        <h3>毎月の請求明細</h3>
        <LinesEditor
          lines={data.lines}
          onChange={(lines) =>
            setData({ ...data, lines, templateConfirmed: false })
          }
        />
        <label className="billing-check">
          <input
            type="checkbox"
            checked={data.templateConfirmed ?? false}
            onChange={(e) =>
              setData({ ...data, templateConfirmed: e.target.checked })
            }
          />
          月次請求の内容を確認済み
        </label>
        <p className="billing-footnote">
          確認済みなら初回から送信待ちになります。自動処理・メール送信が有効な場合、毎月25日に作成し、翌月1日の9時（日本時間）に送信します。
        </p>
        <p className="billing-footnote">
          未確認の場合は保留になります。後から確認済みにすると、今月の未編集の仮請求書だけを更新します。個別に編集・保留した請求書は変更しません。
        </p>
        <button className="btn btn--primary" type="submit">
          {action.busy ? '保存中…' : '請求設定を保存'}
        </button>
      </fieldset>
      {action.feedback}
    </form>
  )
}
