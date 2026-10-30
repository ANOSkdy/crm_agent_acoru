'use client'

import Link from 'next/link'
import type { Deal } from '@/lib/db/queries/deals'
import { deleteDealAction } from '@/lib/actions/deals'
import { createDealGridRowAction, updateDealGridCellAction } from '@/lib/actions/grid-updates'
import { Badge, stageBadgeVariant } from '@/components/ui/Badge'
import { CrmDataGrid } from './CrmDataGrid'
import type { CrmDataGridProps, GridColumn, GridSelectOption } from './gridTypes'
import { confirmDelete, formatCurrency, formatDateText } from './cellUtils'

const statusOptions = [{ value: 'open', label: '進行中' }, { value: 'won', label: '受注' }, { value: 'lost', label: '失注' }]

function buildColumns(companyOptions: GridSelectOption[], stageOptions: GridSelectOption[], fixedCompanyId?: string): GridColumn<Deal>[] {
  return [
    { key: 'title', label: '案件名', width: 220, sortable: true, editable: true, required: true, editor: 'text', getValue: (d) => d.title, renderCell: (d) => <span className="crm-grid__strong">{d.title}</span> },
    ...(fixedCompanyId ? [] : [{ key: 'company_id', label: '会社', width: 180, sortable: true, creatable: true, required: true, editor: 'select', options: companyOptions, filter: 'text', getValue: (d) => d.company_name, renderCell: (d) => <Link href={`/companies/${d.company_id}`} className="crm-grid__link">{d.company_name ?? '-'}</Link> } satisfies GridColumn<Deal>]),
    { key: 'stage_id', label: '営業ステージ', width: 140, sortable: true, editable: true, editor: 'select', options: stageOptions, getValue: (d) => d.stage_id, renderCell: (d) => <Badge variant={stageBadgeVariant(d.stage_name)}>{d.stage_name ?? '-'}</Badge> },
    { key: 'amount', label: '案件金額（円）', width: 140, align: 'right', sortable: true, editable: true, editor: 'currency', aggregate: 'sum', formatAggregate: formatCurrency, getValue: (d) => Number(d.amount), renderCell: (d) => formatCurrency(d.amount) },
    { key: 'probability', label: '受注確度（%）', width: 120, align: 'right', sortable: true, editable: true, editor: 'number', getValue: (d) => d.probability, renderCell: (d) => `${d.probability}%` },
    { key: 'expected_close_date', label: '受注予定日', width: 130, sortable: true, editable: true, editor: 'date', getValue: (d) => d.expected_close_date?.slice(0, 10), renderCell: (d) => formatDateText(d.expected_close_date) },
    { key: 'status', label: '状態', width: 100, sortable: true, editable: true, required: true, editor: 'select', options: statusOptions, defaultValue: () => 'open', getValue: (d) => d.status },
    { key: 'memo', label: 'メモ', width: 220, editable: true, editor: 'textarea', getValue: (d) => d.memo },
    { key: 'actions', label: '操作', width: 100, renderCell: (d) => <span className="crm-grid__actions"><Link href={`/deals/${d.id}`} className="crm-grid__action-link">詳細</Link><form action={deleteDealAction.bind(null, d.id, fixedCompanyId)}><button type="submit" className="crm-grid__action-link crm-grid__action-link--danger" onClick={confirmDelete}>削除</button></form></span> },
  ]
}

type ToolbarProps = Pick<CrmDataGridProps<Deal>, 'actions' | 'initialFilters'>

const weightedSummary = (rows: Deal[]) => <span title="案件金額 × 受注確度">確度加重見込み <strong>{formatCurrency(rows.reduce((sum, d) => sum + Math.round(Number(d.amount) * d.probability / 100), 0))}</strong></span>

export function DealsGrid({ deals, companies = [], stages, fixedCompanyId, canWrite = true, ownerOnlyUserId, title = '案件', ...toolbar }: {
  deals: Deal[]; companies?: { id: string; name: string }[]; stages: { id: string; name: string }[]; fixedCompanyId?: string; canWrite?: boolean
  /** Members may only edit deals they own. */
  ownerOnlyUserId?: string; title?: string
} & ToolbarProps) {
  const columns = buildColumns(companies.map((c) => ({ value: c.id, label: c.name })), stages.map((s) => ({ value: s.id, label: s.name })), fixedCompanyId)
  return <CrmDataGrid {...toolbar} title={title} summary={weightedSummary} ariaLabel="案件一覧グリッド" columns={columns} emptyMessage="案件が見つかりません" getRowId={(row) => row.id} rows={deals}
    canEditRow={(row) => canWrite && (!ownerOnlyUserId || row.owner_user_id === ownerOnlyUserId)}
    createLabel="新しい案件"
    onCreateRow={canWrite ? async (values) => { const result = await createDealGridRowAction(fixedCompanyId ? { ...values, company_id: fixedCompanyId } : values); return result.ok ? { ok: true, row: result.data } : { ok: false, error: result.error } } : undefined}
    onSaveCell={async (row, column, value) => { const result = await updateDealGridCellAction(row.id, column.key as never, value); return result.ok ? { ok: true, row: result.data } : { ok: false, error: result.error } }} />
}
