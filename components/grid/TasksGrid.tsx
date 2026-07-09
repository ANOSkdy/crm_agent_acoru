'use client'

import Link from 'next/link'
import type { Task } from '@/lib/db/queries/tasks'
import { completeTaskAction, deleteTaskAction } from '@/lib/actions/tasks'
import { CrmDataGrid } from './CrmDataGrid'
import type { GridColumn } from './gridTypes'
import { formatDateText } from './cellUtils'

const priorityLabels: Record<string, string> = { high: '高', medium: '中', low: '低' }

const columns: GridColumn<Task>[] = [
  { key: 'title', label: 'タイトル', width: 240, sortable: true, getValue: (t) => t.title, renderCell: (t) => <span className={`crm-grid__strong ${t.status === 'done' ? 'crm-grid__text-done' : ''}`}>{t.title}</span> },
  { key: 'company', label: '会社', width: 180, sortable: true, getValue: (t) => t.company_name, renderCell: (t) => t.company_id ? <Link href={`/companies/${t.company_id}`} className="crm-grid__link">{t.company_name ?? '-'}</Link> : '-' },
  { key: 'priority', label: '優先度', width: 100, sortable: true, getValue: (t) => t.priority, renderCell: (t) => <span className={`crm-grid__priority crm-grid__priority--${t.priority}`}>{priorityLabels[t.priority] ?? t.priority}</span> },
  { key: 'due_date', label: '期限', width: 130, sortable: true, getValue: (t) => t.due_date, renderCell: (t) => <span>{formatDateText(t.due_date)}{isOverdue(t) ? ' ⚠' : ''}</span> },
  { key: 'status', label: 'ステータス', width: 110, sortable: true, getValue: (t) => t.status, renderCell: (t) => t.status === 'done' ? '完了' : '未完' },
  { key: 'actions', label: '操作', width: 170, renderCell: (t) => <span className="crm-grid__actions"><Link href={`/tasks/${t.id}/edit`} className="crm-grid__action-link">編集</Link>{t.status === 'open' && <form action={completeTaskAction.bind(null, t.id)}><button type="submit" className="crm-grid__action-link crm-grid__action-link--success">完了</button></form>}<form action={deleteTaskAction.bind(null, t.id, undefined)}><button type="submit" className="crm-grid__action-link crm-grid__action-link--danger">削除</button></form></span> },
]

function isOverdue(task: Task): boolean {
  return Boolean(task.due_date && task.status === 'open' && new Date(task.due_date) < new Date())
}

export function TasksGrid({ tasks }: { tasks: Task[] }) {
  return <CrmDataGrid ariaLabel="タスク一覧グリッド" columns={columns} emptyMessage="タスクがありません" getRowClassName={(row) => isOverdue(row) ? 'crm-grid__row--overdue' : undefined} getRowId={(row) => row.id} rows={tasks} />
}
