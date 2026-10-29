'use client'
import { useState } from 'react'
import Link from 'next/link'
import {
  type Customer,
  type Invoice,
  type Settings,
  type CrmChoice,
  statusLabels,
} from '@/lib/billing/domain'
import { useBillingAction, yen } from './shared'
import { CrmBillingCustomers } from './CrmBillingCustomers'

type Props = {
  customers: Customer[]
  crmChoices: CrmChoice[]
  initialCompanyId?: string
  invoices: Invoice[]
  settings: { value: Settings; version: number }
  deliveries: Record<string, unknown>[]
  events: Record<string, unknown>[]
  currentPeriod: string
  live: boolean
  allowReal: boolean
}
export function BillingWorkspace(props: Props) {
  const [tab, setTab] = useState(
    props.initialCompanyId ? 'customers' : 'invoices',
  )
  const [period, setPeriod] = useState(props.currentPeriod)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const action = useBillingAction()
  const monthly = props.invoices.filter((i) => i.period === period)
  const filtered = monthly.filter(
    (i) =>
      i.document.name.toLowerCase().includes(search.toLowerCase()) &&
      (status === 'all' || i.status === status),
  )
  const pending = monthly.filter((i) =>
    ['draft', 'simulated'].includes(i.status),
  )
  const attention = props.invoices.filter(
    (i) =>
      ['held', 'uncertain', 'sending'].includes(i.status) ||
      i.document.reviewNote,
  )
  return (
    <div className="billing">
      <div className="billing-heading">
        <div>
          <div className="billing-eyebrow">ACORU / BILLING</div>
          <h1>請求管理</h1>
          <p>毎月の請求作成から送付履歴まで、ひとつの場所で。</p>
        </div>
        <span className={`billing-mode ${props.live ? 'live' : ''}`}>
          {props.live ? 'メール送信可能' : 'メール送信停止中'}
        </span>
      </div>
      {!props.live && (
        <div className="billing-banner">
          <strong>顧客へメールは送信されません。</strong>
          <span>
            請求先の設定・請求書の作成と編集・PDFの確認を行えます。
          </span>
        </div>
      )}
      <p className="billing-toolbar">
        <Link className="btn" href="/billing/templates">
          請求書・見積書テンプレート →
        </Link>
      </p>
      <nav className="billing-tabs" aria-label="請求管理メニュー">
        {[
          ['invoices', '請求一覧'],
          ['customers', '顧客・請求設定'],
          ['history', '送信・実行履歴'],
          ['settings', '設定'],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-current={tab === key ? 'page' : undefined}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === 'invoices' && (
        <>
          <div className="billing-toolbar">
            <label>
              対象月
              <input
                type="month"
                value={period}
                min="2000-01"
                max="2099-12"
                onChange={(e) => setPeriod(e.target.value)}
              />
            </label>
            <div className="billing-spacer" />
            <button
              className="btn btn--primary"
              disabled={action.busy || !period}
              onClick={() => action.run({ action: 'generate', period })}
            >
              {action.busy ? '作成中…' : '月次請求を作成'}
            </button>
          </div>
          {action.feedback}
          <div className="billing-metrics">
            <Metric
              label="請求総額（税込）"
              value={yen(monthly.reduce((s, i) => s + i.total, 0))}
              note={`${monthly.length}件の請求書`}
            />
            <Metric
              label="送信待ち"
              value={`${pending.length}件`}
              note={yen(pending.reduce((s, i) => s + i.total, 0))}
            />
            <Metric
              label="送信済み"
              value={`${monthly.filter((i) => i.status === 'sent').length}件`}
              note="過去の送信履歴を含む"
            />
            <Metric
              label="確認が必要"
              value={`${attention.length}件`}
              note="全期間の保留・送信結果・移行確認"
            />
          </div>
          {attention.length > 0 && (
            <div className="billing-attention">
              要確認：
              {attention.map((i) => (
                <Link key={i.id} href={`/billing/${i.id}`}>
                  {i.id}（
                  {i.document.reviewNote
                    ? '移行データ確認'
                    : statusLabels[i.status]}
                  ）
                </Link>
              ))}
            </div>
          )}
          <section className="billing-panel">
            <div className="billing-panel-head">
              <h2>{period.replace('-', '年')}月の請求書</h2>
              <div className="billing-filters">
                <input
                  aria-label="請求先を検索"
                  placeholder="請求先を検索"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  aria-label="ステータス"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="all">すべての状態</option>
                  {Object.entries(statusLabels).filter(([key]) => key !== 'simulated').map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="billing-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>請求先 / 請求番号</th>
                    <th>送付先</th>
                    <th>支払期日</th>
                    <th className="numeric">税込金額</th>
                    <th>状態</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <Link
                          className="billing-company"
                          href={`/billing/${i.id}`}
                        >
                          {i.document.name}
                        </Link>
                        <small>{i.id}</small>
                      </td>
                      <td className="billing-email">{i.document.email}</td>
                      <td>{i.document.dueDate.replaceAll('-', '/')}</td>
                      <td className="numeric billing-amount">{yen(i.total)}</td>
                      <td>
                        <span className={`billing-status ${i.status}`}>
                          {i.document.provisional
                            ? '仮作成'
                            : statusLabels[i.status]}
                        </span>
                      </td>
                      <td>
                        <Link
                          className="billing-text-button"
                          href={`/billing/${i.id}`}
                        >
                          詳細 →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="billing-empty">
                  該当する請求書はありません。対象月を選ぶか、月次請求を作成してください。
                </div>
              )}
            </div>
          </section>
          <p className="billing-footnote">
            同じ顧客・対象月の請求書は重複作成されません。作成済みの請求は「詳細」から個別に編集できます。
          </p>
        </>
      )}
      {tab === 'customers' && (
        <CrmBillingCustomers
          key={props.customers.map((c) => c.version).join(',')}
          customers={props.customers}
          choices={props.crmChoices}
          initialCompanyId={props.initialCompanyId}
          allowReal={props.allowReal}
        />
      )}
      {tab === 'settings' && (
        <SettingsForm
          key={props.settings.version}
          initial={props.settings}
          live={props.live}
        />
      )}
      {tab === 'history' && (
        <div className="billing-history">
          <section className="billing-panel">
            <div className="billing-panel-head">
              <h2>送信履歴</h2>
              <span>直近100件</span>
            </div>
            <div className="billing-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>日時（日本時間）</th>
                    <th>請求番号</th>
                    <th>送付先</th>
                    <th>結果</th>
                  </tr>
                </thead>
                <tbody>
                  {props.deliveries.map((d) => (
                    <tr key={String(d.id)}>
                      <td>{time(d.created_at)}</td>
                      <td>
                        <Link href={`/billing/${d.invoice_id}`}>
                          {String(d.invoice_id)}
                        </Link>
                      </td>
                      <td>{String(d.recipient)}</td>
                      <td>
                        {d.mode === 'test'
                          ? '未送信'
                          : (statusLabels[d.status as Invoice['status']] ??
                            String(d.status))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {props.deliveries.length === 0 && (
                <div className="billing-empty">
                  送信履歴はまだありません。
                </div>
              )}
            </div>
          </section>
          <section className="billing-panel">
            <div className="billing-panel-head">
              <h2>操作・実行履歴</h2>
            </div>
            <div className="billing-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>日時（日本時間）</th>
                    <th>操作</th>
                    <th>対象</th>
                  </tr>
                </thead>
                <tbody>
                  {props.events.map((e) => (
                    <tr key={String(e.id)}>
                      <td>{time(e.created_at)}</td>
                      <td>
                        {eventLabels[String(e.action)] ?? String(e.action)}
                      </td>
                      <td>{String(e.target ?? '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
function Metric({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note: string
}) {
  return (
    <div className="billing-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  )
}
function time(value: unknown) {
  return new Date(String(value)).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
  })
}
const eventLabels: Record<string, string> = {
  invoice_created: '請求作成',
  invoice_updated: '請求更新',
  customer_saved: '顧客・契約更新',
  settings_saved: '設定更新',
  send_simulated: '未送信',
  send_started: '送信開始',
  sent: 'メール受付完了',
  uncertain: '送信結果要確認',
  schedule_failed: '自動処理エラー',
  legacy_import: '既存データ移行',
}

function SettingsForm({
  initial,
  live,
}: {
  initial: Props['settings']
  live: boolean
}) {
  const [data, setData] = useState(initial.value)
  const action = useBillingAction()
  return (
    <form
      className="billing-panel billing-form"
      onSubmit={(e) => {
        e.preventDefault()
        action.run({ action: 'settings', data, version: initial.version })
      }}
    >
      <h2>自動処理と請求元情報</h2>
      <p>請求元情報の変更は、新しく作成する請求書に反映されます。</p>
      <p>請求書作成は毎月25〜28日、送信は翌月1〜3日の9時（日本時間）に実行します。作成済み・送信済みは重複処理しません。送信結果が不明な場合は確認が必要です。</p>
      <fieldset disabled={action.busy}>
        <label className="billing-check">
          <input
            type="checkbox"
            checked={data.automation}
            onChange={(e) => setData({ ...data, automation: e.target.checked })}
          />
          毎月の自動処理を有効にする（{live ? '作成・送信' : '作成のみ'}）
        </label>
        <div className="billing-form-grid">
          <label>
            当月分の作成開始日（28日まで毎朝確認）
            <input
              type="number"
              min={1}
              max={28}
              required
              value={data.createDay}
              readOnly
            />
          </label>
          <label>
            翌月の送信開始日（3日まで毎朝確認）
            <input
              type="number"
              min={1}
              max={28}
              required
              value={data.sendDay}
              readOnly
            />
          </label>
          <label>
            実行時刻（日本時間・時）
            <input
              type="number"
              min={0}
              max={23}
              required
              value={data.sendHour}
              readOnly
            />
          </label>
          <label>
            送信元
            <input
              type="email"
              required
              value={data.issuer.from}
              onChange={(e) =>
                setData({
                  ...data,
                  issuer: { ...data.issuer, from: e.target.value },
                })
              }
            />
          </label>
          <label>
            自社名
            <input
              required
              maxLength={100}
              value={data.issuer.name}
              onChange={(e) =>
                setData({
                  ...data,
                  issuer: { ...data.issuer, name: e.target.value },
                })
              }
            />
          </label>
          <label>
            登録番号
            <input
              required
              pattern="T[0-9]{13}"
              value={data.issuer.registration}
              onChange={(e) =>
                setData({
                  ...data,
                  issuer: { ...data.issuer, registration: e.target.value },
                })
              }
            />
          </label>
          <label>
            住所
            <input
              required
              maxLength={180}
              value={data.issuer.address}
              onChange={(e) =>
                setData({
                  ...data,
                  issuer: { ...data.issuer, address: e.target.value },
                })
              }
            />
          </label>
          <label>
            電話番号
            <input
              required
              maxLength={40}
              value={data.issuer.tel}
              onChange={(e) =>
                setData({
                  ...data,
                  issuer: { ...data.issuer, tel: e.target.value },
                })
              }
            />
          </label>
        </div>
        <label>
          振込先
          <textarea
            required
            rows={4}
            maxLength={500}
            value={data.issuer.bank}
            onChange={(e) =>
              setData({
                ...data,
                issuer: { ...data.issuer, bank: e.target.value },
              })
            }
          />
        </label>
        <button className="btn btn--primary" type="submit">
          {action.busy ? '保存中…' : '設定を保存'}
        </button>
        {action.feedback}
      </fieldset>
      <p className="billing-footnote">
        メール送信の有効化は環境設定で管理します。
      </p>
    </form>
  )
}
