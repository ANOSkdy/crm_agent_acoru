'use client'

import Link from 'next/link'
import type { Deal } from '@/lib/db/queries/deals'
import { deleteDealAction } from '@/lib/actions/deals'
import { updateDealGridCellAction } from '@/lib/actions/grid-updates'
import { Badge, stageBadgeVariant } from '@/components/ui/Badge'
import { CrmDataGrid } from './CrmDataGrid'
import type { GridColumn } from './gridTypes'
import { formatCurrency, formatDateText } from './cellUtils'

const columns: GridColumn<Deal>[] = [
  { key: 'title', label: '案件名', width: 220, sortable: true, editable: true, editor: 'text', getValue: (d) => d.title, renderCell: (d) => <Link href={`/deals/${d.id}`} className="crm-grid__link crm-grid__link--strong">{d.title}</Link> },
  { key: 'company', label: '会社', width: 180, sortable: true, getValue: (d) => d.company_name, renderCell: (d) => <Link href={`/companies/${d.company_id}`} className="crm-grid__link">{d.company_name ?? '-'}</Link> },
  { key: 'stage', label: '営業ステージ', width: 150, sortable: true, getValue: (d) => d.stage_name, renderCell: (d) => <Badge variant={stageBadgeVariant(d.stage_name)}>{d.stage_name ?? '-'}</Badge> },
  { key: 'amount', label: '案件金額（円）', width: 150, align: 'right', sortable: true, editable: true, editor: 'currency', getValue: (d) => Number(d.amount), renderCell: (d) => formatCurrency(d.amount) },
  { key: 'probability', label: '受注確度（%）', width: 130, align: 'right', sortable: true, editable: true, editor: 'number', getValue: (d) => d.probability, renderCell: (d) => `${d.probability}%` },
  { key: 'expected_close_date', label: '受注予定日', width: 130, sortable: true, editable: true, editor: 'date', getValue: (d) => d.expected_close_date, renderCell: (d) => formatDateText(d.expected_close_date) },
  { key: 'status', label: '状態', width: 110, sortable: true, editable: true, editor: 'select', options: [{ value: 'open', label: '進行中' }, { value: 'won', label: '受注' }, { value: 'lost', label: '失注' }], getValue: (d) => d.status },
  { key: 'actions', label: '操作', width: 120, renderCell: (d) => <span className="crm-grid__actions"><Link href={`/deals/${d.id}/edit`} className="crm-grid__action-link">編集</Link><form action={deleteDealAction.bind(null, d.id, undefined)}><button type="submit" className="crm-grid__action-link crm-grid__action-link--danger">削除</button></form></span> },
]

export function DealsGrid({ deals }: { deals: Deal[] }) {
  return <CrmDataGrid ariaLabel="案件一覧グリッド" columns={columns} emptyMessage="案件が見つかりません" getRowId={(row) => row.id} rows={deals} getRowDetailTitle={(row) => row.title} onSaveCell={async (row, column, value) => { const result = await updateDealGridCellAction(row.id, column.key as never, value); return result.ok ? { ok: true, row: result.data } : { ok: false, error: result.error } }} renderRowDetail={(d) => <div className="detail-list"><Detail label="案件名" value={d.title} /><Detail label="会社" value={d.company_name} /><Detail label="営業ステージ" value={d.stage_name} /><Detail label="状態" value={d.status} /><Detail label="案件金額" value={formatCurrency(d.amount)} /><Detail label="受注確度" value={`${d.probability}%`} /><Detail label="受注予定日" value={formatDateText(d.expected_close_date)} /><div className="modal-footer"><Link href={`/deals/${d.id}`} className="button button-secondary">詳細を開く</Link><Link href={`/deals/${d.id}/edit`} className="button button-primary">編集</Link></div></div>} />
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) { return <div className="detail-list__row"><dt className="detail-list__label">{label}</dt><dd className="detail-list__value">{value || '-'}</dd></div> }
