'use client'

import Link from 'next/link'
import type { Contact } from '@/lib/db/queries/contacts'
import { deleteContactAction } from '@/lib/actions/contacts'
import { updateContactGridCellAction } from '@/lib/actions/grid-updates'
import { CrmDataGrid } from './CrmDataGrid'
import type { GridColumn } from './gridTypes'

const columns: GridColumn<Contact>[] = [
  { key: 'name', label: '氏名', width: 170, sortable: true, editable: true, editor: 'text', getValue: (c) => c.name, renderCell: (c) => <span className="crm-grid__strong">{c.name}</span> },
  { key: 'company', label: '会社', width: 180, sortable: true, getValue: (c) => c.company_name, renderCell: (c) => <Link href={`/companies/${c.company_id}`} className="crm-grid__link">{c.company_name ?? '-'}</Link> },
  { key: 'department', label: '部署', width: 140, sortable: true, editable: true, editor: 'text', getValue: (c) => c.department },
  { key: 'position', label: '役職', width: 140, sortable: true, editable: true, editor: 'text', getValue: (c) => c.position },
  { key: 'email', label: 'メール', width: 220, sortable: true, editable: true, editor: 'email', getValue: (c) => c.email },
  { key: 'phone', label: '電話番号', width: 150, sortable: true, editable: true, editor: 'text', getValue: (c) => c.phone },
  { key: 'is_decision_maker', label: 'KDM', width: 80, align: 'center', sortable: true, editable: true, editor: 'checkbox', getValue: (c) => c.is_decision_maker, renderCell: (c) => c.is_decision_maker ? '✓' : '' },
  { key: 'actions', label: '操作', width: 120, renderCell: (c) => <span className="crm-grid__actions"><Link href={`/contacts/${c.id}/edit`} className="crm-grid__action-link">編集</Link><form action={deleteContactAction.bind(null, c.id, c.company_id)}><button type="submit" className="crm-grid__action-link crm-grid__action-link--danger">削除</button></form></span> },
]

export function ContactsGrid({ contacts }: { contacts: Contact[] }) {
  return <CrmDataGrid ariaLabel="担当者一覧グリッド" columns={columns} emptyMessage="担当者が見つかりません" getRowId={(row) => row.id} rows={contacts} getRowDetailTitle={(row) => row.name} onSaveCell={async (row, column, value) => { const result = await updateContactGridCellAction(row.id, column.key as never, value); return result.ok ? { ok: true, row: result.data } : { ok: false, error: result.error } }} renderRowDetail={(c) => <div className="detail-list"><Detail label="氏名" value={c.name} /><Detail label="会社" value={c.company_name} /><Detail label="部署" value={c.department} /><Detail label="役職" value={c.position} /><Detail label="メール" value={c.email} /><Detail label="電話番号" value={c.phone} /><Detail label="KDM" value={c.is_decision_maker ? 'はい' : 'いいえ'} /><div className="modal-footer"><Link href={`/contacts/${c.id}/edit`} className="button button-primary">編集</Link></div></div>} />
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) { return <div className="detail-list__row"><dt className="detail-list__label">{label}</dt><dd className="detail-list__value">{value || '-'}</dd></div> }
