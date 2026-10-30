'use client'

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { Company } from '@/lib/db/queries/companies'
import type { Deal } from '@/lib/db/queries/deals'
import { updateCompanyGridCellAction, updateDealGridCellAction, type GridActionResult } from '@/lib/actions/grid-updates'
import { Badge, stageBadgeVariant, statusBadgeVariant } from '@/components/ui/Badge'
import type { GridEditorType, GridSelectOption } from './gridTypes'
import { formatCurrency, formatDateText } from './cellUtils'

type Field<Row> = {
  key: string
  label: string
  editor?: GridEditorType
  options?: GridSelectOption[]
  required?: boolean
  wide?: boolean
  note?: string
  readOnly?: boolean
  getValue: (row: Row) => string | number | null | undefined
  render?: (row: Row) => ReactNode
}

// Two-column record sheet: every value is edited in place, like a vertical grid.
function PropertySheet<Row>({ record, fields, canEdit, save }: {
  record: Row; fields: Field<Row>[]; canEdit: boolean; save: (key: string, value: unknown) => Promise<GridActionResult<Row>>
}) {
  const [row, setRow] = useState(record)
  const [source, setSource] = useState(record)
  if (source !== record) { setSource(record); setRow(record) }
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null)
  const [status, setStatus] = useState<{ key: string; state: 'saving' | 'saved' | 'error'; error?: string } | null>(null)
  const inFlight = useRef<string | null>(null)

  const commit = async (next = editing) => {
    if (!next) return
    const field = fields.find((f) => f.key === next.key)
    if (!field) return
    if (String(field.getValue(row) ?? '') === next.value) { setEditing(null); return }
    // A dropdown saves on change and again on blur; send each value once.
    const request = `${next.key}=${next.value}`
    if (inFlight.current === request) return
    inFlight.current = request
    setStatus({ key: field.key, state: 'saving' })
    const result = await save(field.key, next.value).finally(() => { if (inFlight.current === request) inFlight.current = null })
    if (result.ok) {
      setRow(result.data)
      setEditing(null)
      setStatus({ key: field.key, state: 'saved' })
      window.setTimeout(() => setStatus((current) => current?.key === field.key && current.state === 'saved' ? null : current), 1400)
    } else {
      setStatus({ key: field.key, state: 'error', error: result.error })
    }
  }
  const onKeyDown = (field: Field<Row>) => (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); setEditing(null); setStatus(null) }
    if (event.key === 'Enter' && !(field.editor === 'textarea' && (event.shiftKey || event.altKey))) { event.preventDefault(); void commit() }
  }

  return <dl className="record-sheet">
    {fields.map((field) => {
      const isEditing = editing?.key === field.key
      const fieldStatus = status?.key === field.key ? status : null
      const label = `${field.label}を編集`
      const editable = canEdit && !field.readOnly
      const editor = !isEditing ? null : field.editor === 'select'
        ? <select autoFocus aria-label={label} className="crm-grid__editor-select" value={editing.value} onChange={(e) => { const next = { key: field.key, value: e.target.value }; setEditing(next); void commit(next) }} onBlur={() => void commit()} onKeyDown={onKeyDown(field)}>{field.required ? null : <option value="">（なし）</option>}{field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        : field.editor === 'textarea'
          ? <textarea autoFocus aria-label={label} rows={4} className="crm-grid__editor-input crm-grid__editor-textarea" value={editing.value} onChange={(e) => setEditing({ key: field.key, value: e.target.value })} onBlur={() => void commit()} onKeyDown={onKeyDown(field)} />
          : <input autoFocus aria-label={label} className="crm-grid__editor-input" type={field.editor === 'currency' ? 'number' : field.editor ?? 'text'} value={editing.value} onChange={(e) => setEditing({ key: field.key, value: e.target.value })} onBlur={() => void commit()} onKeyDown={onKeyDown(field)} />
      return <div key={field.key} className={`record-sheet__row${field.wide ? ' record-sheet__row--wide' : ''}`}>
        <dt className="record-sheet__label">{field.label}{field.note ? <small>{field.note}</small> : null}</dt>
        <dd className={`record-sheet__value${editable ? ' record-sheet__value--editable' : ''}${fieldStatus ? ` crm-grid__cell--${fieldStatus.state}` : ''}`}
          tabIndex={editable && !isEditing ? 0 : undefined}
          title={editable && !isEditing ? 'クリックで編集' : undefined}
          onClick={(event) => { if (!editable || isEditing || (event.target as HTMLElement).closest('a')) return; setStatus(null); setEditing({ key: field.key, value: String(field.getValue(row) ?? '') }) }}
          onKeyDown={(event) => { if (editable && !isEditing && (event.key === 'Enter' || event.key === 'F2')) { event.preventDefault(); setEditing({ key: field.key, value: String(field.getValue(row) ?? '') }) } }}>
          {editor ?? (field.render ? field.render(row) : (field.options?.find((o) => o.value === String(field.getValue(row)))?.label ?? field.getValue(row) ?? '-'))}
          {fieldStatus?.state === 'saving' ? <span className="crm-grid__cell-status">保存中</span> : null}
          {fieldStatus?.state === 'saved' ? <span className="crm-grid__cell-status">保存済み</span> : null}
          {fieldStatus?.state === 'error' ? <span className="crm-grid__cell-error" role="alert">⚠ {fieldStatus.error}</span> : null}
        </dd>
      </div>
    })}
  </dl>
}

const companyFields: Field<Company>[] = [
  { key: 'name', label: '会社名', required: true, getValue: (c) => c.name },
  { key: 'status', label: 'ステータス', editor: 'select', required: true, options: [{ value: 'active', label: 'アクティブ' }, { value: 'inactive', label: '非アクティブ' }], getValue: (c) => c.status, render: (c) => <Badge variant={statusBadgeVariant(c.status)}>{c.status === 'active' ? 'アクティブ' : '非アクティブ'}</Badge> },
  { key: 'industry', label: '業種', getValue: (c) => c.industry },
  { key: 'phone', label: '電話番号', getValue: (c) => c.phone },
  { key: 'postal_code', label: '郵便番号', getValue: (c) => c.postal_code },
  { key: 'address', label: '住所', getValue: (c) => c.address },
  { key: 'website_url', label: 'ウェブサイト', editor: 'url', getValue: (c) => c.website_url, render: (c) => c.website_url ? <a href={c.website_url} target="_blank" rel="noopener noreferrer" className="crm-grid__link">{c.website_url}</a> : '-' },
  { key: 'corporate_number', label: '法人番号', getValue: (c) => c.corporate_number },
  { key: 'source', label: '流入元', getValue: (c) => c.source },
  { key: 'memo', label: 'メモ', editor: 'textarea', wide: true, getValue: (c) => c.memo, render: (c) => <span className="record-sheet__multiline">{c.memo || '-'}</span> },
]

export function CompanyProperties({ company, canEdit }: { company: Company; canEdit: boolean }) {
  return <PropertySheet record={company} fields={companyFields} canEdit={canEdit} save={(key, value) => updateCompanyGridCellAction(company.id, key as never, value)} />
}

export function DealProperties({ deal, stages, canEdit }: { deal: Deal; stages: { id: string; name: string }[]; canEdit: boolean }) {
  const fields: Field<Deal>[] = [
    { key: 'title', label: '案件名', required: true, getValue: (d) => d.title },
    { key: 'stage_id', label: '営業ステージ', editor: 'select', options: stages.map((s) => ({ value: s.id, label: s.name })), getValue: (d) => d.stage_id, render: (d) => <Badge variant={stageBadgeVariant(d.stage_name)}>{d.stage_name ?? 'ステージ未設定'}</Badge> },
    { key: 'amount', label: '案件金額（円）', editor: 'currency', note: 'この案件で見込む受注金額', getValue: (d) => Number(d.amount), render: (d) => <strong>{formatCurrency(d.amount)}</strong> },
    { key: 'probability', label: '受注確度（%）', editor: 'number', note: '受注・成立する見込み度合い', getValue: (d) => d.probability, render: (d) => `${d.probability}%` },
    { key: 'weighted', label: '確度加重見込み金額（円）', readOnly: true, note: '案件金額 × 受注確度', getValue: (d) => Math.round(Number(d.amount) * d.probability / 100), render: (d) => formatCurrency(Math.round(Number(d.amount) * d.probability / 100)) },
    { key: 'expected_close_date', label: '受注予定日', editor: 'date', getValue: (d) => d.expected_close_date?.slice(0, 10), render: (d) => formatDateText(d.expected_close_date) },
    { key: 'status', label: '状態', editor: 'select', required: true, options: [{ value: 'open', label: '進行中' }, { value: 'won', label: '受注' }, { value: 'lost', label: '失注' }], getValue: (d) => d.status },
    { key: 'memo', label: 'メモ', editor: 'textarea', wide: true, getValue: (d) => d.memo, render: (d) => <span className="record-sheet__multiline">{d.memo || '-'}</span> },
  ]
  return <PropertySheet record={deal} fields={fields} canEdit={canEdit}
    save={(key, value) => updateDealGridCellAction(deal.id, key as never, value)} />
}
