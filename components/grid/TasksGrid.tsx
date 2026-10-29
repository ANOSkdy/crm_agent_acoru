'use client'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateTaskGridCellAction } from '@/lib/actions/grid-updates'
import type { Task } from '@/lib/db/queries/tasks'
import { taskStatusLabels } from '@/lib/validation/task'
import { formatDisplayDate } from '@/lib/utils/date'

function StatusCell({ task, editable }: { task: Task; editable: boolean }) {
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  if (!editable) return <span>{taskStatusLabels[task.status]}</span>
  return <><select aria-label={`No ${task.issue_number} の状態`} className="crm-grid__inline-select" value={task.status} disabled={pending} onChange={event => {
    const value = event.target.value
    setError('')
    startTransition(async () => {
      const result = await updateTaskGridCellAction(task.id, 'status', value)
      if (!result.ok) setError(result.error)
      else router.refresh()
    })
  }}>{Object.entries(taskStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{error && <p role="alert" className="crm-grid__cell-error">{error}</p>}</>
}
const columns = [
  { label: 'No', width: 64 }, { label: '起票日', width: 104 }, { label: '内容', width: 320 }, { label: '完了条件', width: 240 },
  { label: '期限', width: 110 }, { label: '進捗', width: 260 }, { label: '状態', width: 130 },
]

export function TasksGrid({ tasks, total = tasks.length, editableIds = [], today }: { tasks: Task[]; total?: number; editableIds?: string[]; today: string }) {
  const overdueCount = tasks.filter(task => isOverdue(task, today)).length
  return <div className="crm-grid">
    <div className="crm-grid__scroller" role="region" aria-label="課題一覧" tabIndex={0}>
      <table className="crm-grid__table" style={{ minWidth: 1000 }}>
        <colgroup>{columns.map(column => <col key={column.label} style={{ width: column.width }} />)}</colgroup>
        <thead className="crm-grid__head"><tr>{columns.map(column => <th key={column.label} scope="col" className="crm-grid__header">{column.label}</th>)}</tr></thead>
        <tbody>{tasks.map(task => {
          const editable = editableIds.includes(task.id)
          const overdue = isOverdue(task, today)
          return <tr key={task.id} className={`crm-grid__row${overdue ? ' crm-grid__row--overdue' : ''}`}>
            <td className="crm-grid__cell crm-grid__cell--wrap crm-grid__cell--right">{editable ? <Link href={`/tasks/${task.id}/edit`} aria-label={`課題 No ${task.issue_number} を編集`} className="crm-grid__link crm-grid__link--strong">{task.issue_number}</Link> : task.issue_number}</td>
            <td className="crm-grid__cell crm-grid__cell--wrap">{formatDisplayDate(task.opened_on)}</td>
            <td className="crm-grid__cell crm-grid__cell--wrap">{task.title}</td>
            <td className="crm-grid__cell crm-grid__cell--wrap">{task.completion_criteria || '—'}</td>
            <td className="crm-grid__cell crm-grid__cell--wrap">{formatDisplayDate(task.due_date)}{overdue && <span className="crm-grid__overdue-note">期限超過</span>}</td>
            <td className="crm-grid__cell crm-grid__cell--wrap">{task.progress || '—'}</td>
            <td className="crm-grid__cell crm-grid__cell--wrap"><StatusCell task={task} editable={editable} /></td>
          </tr>
        })}{!tasks.length && <tr><td colSpan={7} className="crm-grid__empty">課題がありません</td></tr>}</tbody>
      </table>
    </div>
    <div className="crm-grid__status" role="status">
      <span>{tasks.length === total ? <><strong>{total.toLocaleString()}</strong> 件</> : <>表示 <strong>{tasks.length.toLocaleString()}</strong> / 全 {total.toLocaleString()} 件</>}</span>
      {overdueCount > 0 && <span style={{ color: 'var(--color-danger)' }}>期限超過 {overdueCount} 件</span>}
      <span className="crm-grid__status-spacer" />
      {editableIds.length > 0 && <span>Noから課題を編集できます</span>}
    </div>
  </div>
}

function isOverdue(task: Task, today: string) {
  return !!task.due_date && ['open', 'in_progress'].includes(task.status) && task.due_date.slice(0, 10) < today
}
