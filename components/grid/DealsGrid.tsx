'use client'

import Link from 'next/link'
import type { Deal } from '@/lib/db/queries/deals'
import { deleteDealAction } from '@/lib/actions/deals'
import { Badge, stageBadgeVariant } from '@/components/ui/Badge'
import { CrmDataGrid } from './CrmDataGrid'
import type { GridColumn } from './gridTypes'
import { formatCurrency, formatDateText } from './cellUtils'

const columns: GridColumn<Deal>[] = [
  { key: 'title', label: '案件名', width: 220, sortable: true, getValue: (d) => d.title, renderCell: (d) => <Link href={`/deals/${d.id}`} className="crm-grid__link crm-grid__link--strong">{d.title}</Link> },
  { key: 'company', label: '会社', width: 180, sortable: true, getValue: (d) => d.company_name, renderCell: (d) => <Link href={`/companies/${d.company_id}`} className="crm-grid__link">{d.company_name ?? '-'}</Link> },
  { key: 'stage', label: '営業ステージ', width: 150, sortable: true, getValue: (d) => d.stage_name, renderCell: (d) => <Badge variant={stageBadgeVariant(d.stage_name)}>{d.stage_name ?? '-'}</Badge> },
  { key: 'amount', label: '案件金額（円）', width: 150, align: 'right', sortable: true, getValue: (d) => Number(d.amount), renderCell: (d) => formatCurrency(d.amount) },
  { key: 'probability', label: '受注確度（%）', width: 130, align: 'right', sortable: true, getValue: (d) => d.probability, renderCell: (d) => `${d.probability}%` },
  { key: 'expected_close_date', label: '受注予定日', width: 130, sortable: true, getValue: (d) => d.expected_close_date, renderCell: (d) => formatDateText(d.expected_close_date) },
  { key: 'actions', label: '操作', width: 120, renderCell: (d) => <span className="crm-grid__actions"><Link href={`/deals/${d.id}/edit`} className="crm-grid__action-link">編集</Link><form action={deleteDealAction.bind(null, d.id, undefined)}><button type="submit" className="crm-grid__action-link crm-grid__action-link--danger">削除</button></form></span> },
]

export function DealsGrid({ deals }: { deals: Deal[] }) {
  return <CrmDataGrid ariaLabel="案件一覧グリッド" columns={columns} emptyMessage="案件が見つかりません" getRowId={(row) => row.id} rows={deals} />
}
