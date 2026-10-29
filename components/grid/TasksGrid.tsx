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
  return <><select aria-label={`No ${task.issue_number} の状態`} className="select min-w-28" value={task.status} disabled={pending} onChange={event => {
    const value = event.target.value
    setError('')
    startTransition(async () => {
      const result = await updateTaskGridCellAction(task.id, 'status', value)
      if (!result.ok) setError(result.error)
      else router.refresh()
    })
  }}>{Object.entries(taskStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{error && <p role="alert" className="text-xs text-red-700 mt-2">{error}</p>}</>
}
export function TasksGrid({ tasks, editableIds = [], today }: { tasks: Task[]; editableIds?: string[]; today: string }) {
  return <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white" role="region" aria-label="課題一覧" tabIndex={0}>
    <table className="w-full min-w-[1000px] text-sm text-left">
      <thead className="bg-gray-50 text-gray-600"><tr>{['No', '起票日', '内容', '完了条件', '期限', '進捗', '状態'].map(label => <th key={label} scope="col" className="px-4 py-3 whitespace-nowrap">{label}</th>)}</tr></thead>
      <tbody className="divide-y divide-gray-100">{tasks.map(task => {
        const editable = editableIds.includes(task.id)
        const overdue = !!task.due_date && ['open', 'in_progress'].includes(task.status) && task.due_date.slice(0, 10) < today
        return <tr key={task.id} className={overdue ? 'bg-red-50' : undefined}>
          <td className="px-4 py-3 tabular-nums">{editable ? <Link href={`/tasks/${task.id}/edit`} aria-label={`課題 No ${task.issue_number} を編集`} className="text-blue-600 underline">{task.issue_number}</Link> : task.issue_number}</td>
          <td className="px-4 py-3 whitespace-nowrap">{formatDisplayDate(task.opened_on)}</td>
          <td className="px-4 py-3 min-w-56 max-w-md whitespace-pre-wrap break-words">{task.title}</td>
          <td className="px-4 py-3 min-w-48 max-w-md whitespace-pre-wrap break-words">{task.completion_criteria || '—'}</td>
          <td className={`px-4 py-3 whitespace-nowrap ${overdue ? 'text-red-700' : ''}`}>{formatDisplayDate(task.due_date)}{overdue && <span className="block text-xs">期限超過</span>}</td>
          <td className="px-4 py-3 min-w-48 max-w-md whitespace-pre-wrap break-words">{task.progress || '—'}</td>
          <td className="px-4 py-3"><StatusCell task={task} editable={editable} /></td>
        </tr>
      })}{!tasks.length && <tr><td colSpan={7} className="p-8 text-center text-gray-500">課題がありません</td></tr>}</tbody>
    </table>
  </div>
}
