'use client'
import { useRouter } from 'next/navigation'
import { createTaskGridRowAction, updateTaskGridCellAction } from '@/lib/actions/grid-updates'
import { deleteTaskAction } from '@/lib/actions/tasks'
import type { Task } from '@/lib/db/queries/tasks'
import { taskStatusLabels } from '@/lib/validation/task'
import { formatDisplayDate } from '@/lib/utils/date'
import { CrmDataGrid } from './CrmDataGrid'
import type { GridColumn } from './gridTypes'

const statusOptions = Object.entries(taskStatusLabels).map(([value, label]) => ({ value, label }))

function isOverdue(task: Task, today: string) {
  return !!task.due_date && ['open', 'in_progress'].includes(task.status) && task.due_date.slice(0, 10) < today
}

export function TasksGrid({ tasks, companyId, editableIds = [], canWrite = false, today }: {
  tasks: Task[]; companyId?: string; editableIds?: string[]; canWrite?: boolean; today: string
}) {
  const router = useRouter()
  const columns: GridColumn<Task>[] = [
    { key: 'issue_number', label: 'No', width: 70, align: 'right', sortable: true, editable: true, editor: 'number', getValue: (t) => t.issue_number },
    { key: 'opened_on', label: '起票日', width: 120, sortable: true, editable: true, required: true, editor: 'date', defaultValue: () => today, getValue: (t) => t.opened_on, renderCell: (t) => formatDisplayDate(t.opened_on) },
    { key: 'title', label: '内容', width: 320, editable: true, required: true, editor: 'textarea', wrap: true, getValue: (t) => t.title },
    { key: 'completion_criteria', label: '完了条件', width: 240, editable: true, editor: 'textarea', wrap: true, getValue: (t) => t.completion_criteria, renderCell: (t) => t.completion_criteria || '—' },
    { key: 'due_date', label: '期限', width: 120, sortable: true, editable: true, editor: 'date', getValue: (t) => t.due_date, renderCell: (t) => <>{formatDisplayDate(t.due_date)}{isOverdue(t, today) && <span className="crm-grid__overdue-note">期限超過</span>}</> },
    { key: 'progress', label: '進捗', width: 260, editable: true, editor: 'textarea', wrap: true, getValue: (t) => t.progress, renderCell: (t) => t.progress || '—' },
    { key: 'status', label: '状態', width: 100, sortable: true, editable: true, required: true, editor: 'select', options: statusOptions, defaultValue: () => 'open', getValue: (t) => t.status },
    ...(canWrite ? [{ key: 'actions', label: '操作', width: 70, renderCell: (t: Task) => editableIds.includes(t.id) ? <button type="button" className="crm-grid__action-link crm-grid__action-link--danger" aria-label={`課題 No ${t.issue_number} を削除`} onClick={async () => {
      if (!window.confirm('この課題を削除しますか？')) return
      const result = await deleteTaskAction(t.id)
      if (result.error) window.alert(result.error)
      else router.refresh()
    }}>削除</button> : null }] : []),
  ]
  return <CrmDataGrid ariaLabel="課題一覧" columns={columns} rows={tasks} emptyMessage="課題がありません" getRowId={(row) => row.id}
    getRowClassName={(row) => isOverdue(row, today) ? 'crm-grid__row--overdue' : undefined}
    canEditRow={(row) => editableIds.includes(row.id)}
    createLabel="新しい課題"
    onCreateRow={canWrite && companyId ? async (values) => {
      const result = await createTaskGridRowAction({ ...values, company_id: companyId })
      if (!result.ok) return { ok: false, error: result.error }
      router.refresh()
      return { ok: true, row: result.data }
    } : undefined}
    onSaveCell={async (row, column, value) => { const result = await updateTaskGridCellAction(row.id, column.key as never, value); return result.ok ? { ok: true, row: result.data } : { ok: false, error: result.error } }} />
}
