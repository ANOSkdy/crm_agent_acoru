'use client'

import Link from 'next/link'
import type { Company } from '@/lib/db/queries/companies'
import { updateCompanyGridCellAction } from '@/lib/actions/grid-updates'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import { CrmDataGrid } from './CrmDataGrid'
import type { GridColumn } from './gridTypes'
import { formatDateText } from './cellUtils'

const columns: GridColumn<Company>[] = [
  { key: 'name', label: '会社名', width: 220, sortable: true, editable: true, editor: 'text', getValue: (c) => c.name, renderCell: (c) => <Link href={`/companies/${c.id}`} className="crm-grid__link crm-grid__link--strong">{c.name}</Link> },
  { key: 'industry', label: '業種', width: 160, sortable: true, editable: true, editor: 'text', getValue: (c) => c.industry },
  { key: 'phone', label: '電話番号', width: 150, sortable: true, editable: true, editor: 'text', getValue: (c) => c.phone },
  { key: 'status', label: 'ステータス', width: 130, sortable: true, editable: true, editor: 'select', options: [{ value: 'active', label: 'アクティブ' }, { value: 'inactive', label: '非アクティブ' }], getValue: (c) => c.status, renderCell: (c) => <Badge variant={statusBadgeVariant(c.status)}>{c.status === 'active' ? 'アクティブ' : '非アクティブ'}</Badge> },
  { key: 'created_at', label: '作成日', width: 130, sortable: true, getValue: (c) => c.created_at, renderCell: (c) => formatDateText(c.created_at) },
]

export function CompaniesGrid({ companies }: { companies: Company[] }) {
  return <CrmDataGrid ariaLabel="顧客一覧グリッド" columns={columns} emptyMessage="顧客が見つかりません" getRowId={(row) => row.id} rows={companies} getRowDetailTitle={(row) => row.name} onSaveCell={async (row, column, value) => { const result = await updateCompanyGridCellAction(row.id, column.key as never, value); return result.ok ? { ok: true, row: result.data } : { ok: false, error: result.error } }} renderRowDetail={(c) => <div className="detail-list"><Detail label="会社名" value={c.name} /><Detail label="業種" value={c.industry} /><Detail label="電話番号" value={c.phone} /><Detail label="ステータス" value={c.status === 'active' ? 'アクティブ' : '非アクティブ'} /><Detail label="作成日" value={formatDateText(c.created_at)} /><div className="modal-footer"><Link href={`/companies/${c.id}`} className="button button-secondary">詳細を開く</Link><Link href={`/companies/${c.id}/edit`} className="button button-primary">編集</Link></div></div>} />
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) { return <div className="detail-list__row"><dt className="detail-list__label">{label}</dt><dd className="detail-list__value">{value || '-'}</dd></div> }
