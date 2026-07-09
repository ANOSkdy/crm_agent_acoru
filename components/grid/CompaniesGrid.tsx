'use client'

import Link from 'next/link'
import type { Company } from '@/lib/db/queries/companies'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import { CrmDataGrid } from './CrmDataGrid'
import type { GridColumn } from './gridTypes'
import { formatDateText } from './cellUtils'

const columns: GridColumn<Company>[] = [
  { key: 'name', label: '会社名', width: 220, sortable: true, getValue: (c) => c.name, renderCell: (c) => <Link href={`/companies/${c.id}`} className="crm-grid__link crm-grid__link--strong">{c.name}</Link> },
  { key: 'industry', label: '業種', width: 160, sortable: true, getValue: (c) => c.industry },
  { key: 'phone', label: '電話番号', width: 150, sortable: true, getValue: (c) => c.phone },
  { key: 'status', label: 'ステータス', width: 130, sortable: true, getValue: (c) => c.status, renderCell: (c) => <Badge variant={statusBadgeVariant(c.status)}>{c.status === 'active' ? 'アクティブ' : '非アクティブ'}</Badge> },
  { key: 'created_at', label: '作成日', width: 130, sortable: true, getValue: (c) => c.created_at, renderCell: (c) => formatDateText(c.created_at) },
]

export function CompaniesGrid({ companies }: { companies: Company[] }) {
  return <CrmDataGrid ariaLabel="顧客一覧グリッド" columns={columns} emptyMessage="顧客が見つかりません" getRowId={(row) => row.id} rows={companies} />
}
