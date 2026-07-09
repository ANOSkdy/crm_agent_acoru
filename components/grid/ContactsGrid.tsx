'use client'

import Link from 'next/link'
import type { Contact } from '@/lib/db/queries/contacts'
import { deleteContactAction } from '@/lib/actions/contacts'
import { CrmDataGrid } from './CrmDataGrid'
import type { GridColumn } from './gridTypes'

const columns: GridColumn<Contact>[] = [
  { key: 'name', label: '氏名', width: 170, sortable: true, getValue: (c) => c.name, renderCell: (c) => <span className="crm-grid__strong">{c.name}</span> },
  { key: 'company', label: '会社', width: 180, sortable: true, getValue: (c) => c.company_name, renderCell: (c) => <Link href={`/companies/${c.company_id}`} className="crm-grid__link">{c.company_name ?? '-'}</Link> },
  { key: 'department', label: '部署', width: 140, sortable: true, getValue: (c) => c.department },
  { key: 'position', label: '役職', width: 140, sortable: true, getValue: (c) => c.position },
  { key: 'email', label: 'メール', width: 220, sortable: true, getValue: (c) => c.email },
  { key: 'is_decision_maker', label: 'KDM', width: 80, align: 'center', sortable: true, getValue: (c) => c.is_decision_maker, renderCell: (c) => c.is_decision_maker ? '✓' : '' },
  { key: 'actions', label: '操作', width: 120, renderCell: (c) => <span className="crm-grid__actions"><Link href={`/contacts/${c.id}/edit`} className="crm-grid__action-link">編集</Link><form action={deleteContactAction.bind(null, c.id, c.company_id)}><button type="submit" className="crm-grid__action-link crm-grid__action-link--danger">削除</button></form></span> },
]

export function ContactsGrid({ contacts }: { contacts: Contact[] }) {
  return <CrmDataGrid ariaLabel="担当者一覧グリッド" columns={columns} emptyMessage="担当者が見つかりません" getRowId={(row) => row.id} rows={contacts} />
}
