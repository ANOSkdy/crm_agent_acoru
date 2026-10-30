'use client'

import Link from 'next/link'
import type { Contact } from '@/lib/db/queries/contacts'
import { deleteContactAction } from '@/lib/actions/contacts'
import { createContactGridRowAction, updateContactGridCellAction } from '@/lib/actions/grid-updates'
import { CrmDataGrid } from './CrmDataGrid'
import type { GridColumn, GridSelectOption } from './gridTypes'
import { confirmDelete } from './cellUtils'

function buildColumns(companyOptions: GridSelectOption[], fixedCompanyId?: string): GridColumn<Contact>[] {
  return [
    { key: 'name', label: '氏名', width: 160, sortable: true, editable: true, required: true, editor: 'text', getValue: (c) => c.name, renderCell: (c) => <span className="crm-grid__strong">{c.name}</span> },
    ...(fixedCompanyId ? [] : [{ key: 'company_id', label: '会社', width: 180, sortable: true, creatable: true, required: true, editor: 'select', options: companyOptions, filter: 'text', getValue: (c) => c.company_name, renderCell: (c) => <Link href={`/companies/${c.company_id}`} className="crm-grid__link">{c.company_name ?? '-'}</Link> } satisfies GridColumn<Contact>]),
    { key: 'department', label: '部署', width: 130, sortable: true, editable: true, editor: 'text', filter: 'select', getValue: (c) => c.department },
    { key: 'position', label: '役職', width: 120, sortable: true, editable: true, editor: 'text', filter: 'select', getValue: (c) => c.position },
    { key: 'email', label: 'メール', width: 220, sortable: true, editable: true, editor: 'email', getValue: (c) => c.email },
    { key: 'phone', label: '電話番号', width: 140, sortable: true, editable: true, editor: 'text', getValue: (c) => c.phone },
    { key: 'is_decision_maker', label: 'KDM', width: 70, align: 'center', sortable: true, editable: true, editor: 'checkbox', filter: 'select', getValue: (c) => c.is_decision_maker, renderCell: (c) => c.is_decision_maker ? '✓' : '' },
    { key: 'memo', label: 'メモ', width: 220, editable: true, editor: 'textarea', getValue: (c) => c.memo },
    { key: 'actions', label: '操作', width: 70, renderCell: (c) => <span className="crm-grid__actions"><form action={deleteContactAction.bind(null, c.id, fixedCompanyId)}><button type="submit" className="crm-grid__action-link crm-grid__action-link--danger" onClick={confirmDelete}>削除</button></form></span> },
  ]
}

export function ContactsGrid({ contacts, companies = [], fixedCompanyId, canWrite = true, title = '担当者' }: {
  contacts: Contact[]; companies?: { id: string; name: string }[]; fixedCompanyId?: string; canWrite?: boolean; title?: string
}) {
  const columns = buildColumns(companies.map((c) => ({ value: c.id, label: c.name })), fixedCompanyId)
  return <CrmDataGrid title={title} ariaLabel="担当者一覧グリッド" columns={columns} emptyMessage="担当者が見つかりません" getRowId={(row) => row.id} rows={contacts}
    canEditRow={() => canWrite}
    createLabel="新しい担当者"
    onCreateRow={canWrite ? async (values) => { const result = await createContactGridRowAction(fixedCompanyId ? { ...values, company_id: fixedCompanyId } : values); return result.ok ? { ok: true, row: result.data } : { ok: false, error: result.error } } : undefined}
    onSaveCell={async (row, column, value) => { const result = await updateContactGridCellAction(row.id, column.key as never, value); return result.ok ? { ok: true, row: result.data } : { ok: false, error: result.error } }} />
}
