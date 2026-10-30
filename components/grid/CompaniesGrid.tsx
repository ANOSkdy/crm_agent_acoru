'use client'

import Link from 'next/link'
import type { Company } from '@/lib/db/queries/companies'
import { createCompanyGridRowAction, updateCompanyGridCellAction } from '@/lib/actions/grid-updates'
import { deleteCompanyAction } from '@/lib/actions/companies'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import { CrmDataGrid } from './CrmDataGrid'
import type { CrmDataGridProps, GridColumn } from './gridTypes'
import { confirmDelete, formatDateText } from './cellUtils'

const statusOptions = [{ value: 'active', label: 'アクティブ' }, { value: 'inactive', label: '非アクティブ' }]

const columns: GridColumn<Company>[] = [
  { key: 'name', label: '会社名', width: 220, sortable: true, editable: true, required: true, editor: 'text', getValue: (c) => c.name, renderCell: (c) => <span className="crm-grid__strong">{c.name}</span> },
  { key: 'status', label: 'ステータス', width: 120, sortable: true, editable: true, required: true, editor: 'select', options: statusOptions, defaultValue: () => 'active', getValue: (c) => c.status, renderCell: (c) => <Badge variant={statusBadgeVariant(c.status)}>{c.status === 'active' ? 'アクティブ' : '非アクティブ'}</Badge> },
  { key: 'industry', label: '業種', width: 130, sortable: true, editable: true, editor: 'text', filter: 'select', getValue: (c) => c.industry },
  { key: 'phone', label: '電話番号', width: 140, sortable: true, editable: true, editor: 'text', getValue: (c) => c.phone },
  { key: 'postal_code', label: '郵便番号', width: 100, sortable: true, editable: true, editor: 'text', getValue: (c) => c.postal_code },
  { key: 'address', label: '住所', width: 240, sortable: true, editable: true, editor: 'text', getValue: (c) => c.address },
  { key: 'website_url', label: 'ウェブサイト', width: 200, sortable: true, editable: true, editor: 'url', getValue: (c) => c.website_url, renderCell: (c) => c.website_url ? <a href={c.website_url} target="_blank" rel="noopener noreferrer" className="crm-grid__link">{c.website_url}</a> : '-' },
  { key: 'corporate_number', label: '法人番号', width: 140, sortable: true, editable: true, editor: 'text', getValue: (c) => c.corporate_number },
  { key: 'source', label: '流入元', width: 120, sortable: true, editable: true, editor: 'text', filter: 'select', getValue: (c) => c.source },
  { key: 'memo', label: 'メモ', width: 240, editable: true, editor: 'textarea', getValue: (c) => c.memo },
  { key: 'created_at', label: '作成日', width: 110, sortable: true, filter: false, getValue: (c) => c.created_at, renderCell: (c) => formatDateText(c.created_at) },
  { key: 'actions', label: '操作', width: 110, renderCell: (c) => <span className="crm-grid__actions"><Link href={`/companies/${c.id}`} className="crm-grid__action-link">詳細</Link><form action={deleteCompanyAction.bind(null, c.id)}><button type="submit" className="crm-grid__action-link crm-grid__action-link--danger" onClick={confirmDelete}>削除</button></form></span> },
]

type ToolbarProps = Pick<CrmDataGridProps<Company>, 'actions' | 'initialQuery' | 'initialFilters'>

export function CompaniesGrid({ companies, canWrite = true, ...toolbar }: { companies: Company[]; canWrite?: boolean } & ToolbarProps) {
  return <CrmDataGrid {...toolbar} title="顧客" ariaLabel="顧客一覧グリッド" columns={columns} emptyMessage="顧客が見つかりません" getRowId={(row) => row.id} rows={companies}
    canEditRow={() => canWrite}
    createLabel="新しい顧客"
    onCreateRow={canWrite ? async (values) => { const result = await createCompanyGridRowAction(values); return result.ok ? { ok: true, row: result.data } : { ok: false, error: result.error } } : undefined}
    onSaveCell={async (row, column, value) => { const result = await updateCompanyGridCellAction(row.id, column.key as never, value); return result.ok ? { ok: true, row: result.data } : { ok: false, error: result.error } }} />
}
