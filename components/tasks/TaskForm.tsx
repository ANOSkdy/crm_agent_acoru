'use client'
import { useActionState, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createTaskAction, updateTaskAction, deleteTaskAction } from '@/lib/actions/tasks'
import { taskStatusLabels } from '@/lib/validation/task'
import { toDateInputValue } from '@/lib/utils/date'
import type { Task } from '@/lib/db/queries/tasks'

export function TaskForm({ task, companyId, companies = [], today }: {
  task?: Task; companyId?: string; companies?: { id: string; name: string }[]; today: string
}) {
  const action = task ? updateTaskAction.bind(null, task.id) : createTaskAction
  const [state, submit, pending] = useActionState(action, {})
  const [deleteError, setDeleteError] = useState('')
  const [deleting, startDelete] = useTransition()
  const router = useRouter()
  const back = '/tasks?company=' + (task?.company_id ?? companyId ?? 'unassigned')
  return <form action={submit} className="space-y-4">
    {task ? <label className="form-field"><span className="form-label">顧客</span>
      <select aria-label="顧客" name="company_id" defaultValue={task.company_id ?? ''} className="select" required={!!task.company_id}>
        {!task.company_id && <option value="">未設定</option>}
        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select></label> : <input type="hidden" name="company_id" value={companyId} />}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <label className="form-field"><span className="form-label">No</span><input name="issue_number" type="number" min="1" max="2147483647" step="1" required={!!task} defaultValue={task?.issue_number ?? ''} placeholder="空欄で自動採番" className="input" /></label>
      <label className="form-field"><span className="form-label">起票日 *</span><input name="opened_on" type="date" required defaultValue={task ? toDateInputValue(task.opened_on) : today} className="input" /></label>
    </div>
    <label className="form-field"><span className="form-label">内容 *</span><textarea aria-label="内容 *" name="title" required maxLength={4000} rows={3} defaultValue={task?.title ?? ''} className="input min-h-24" /></label>
    <label className="form-field"><span className="form-label">完了条件</span><textarea aria-label="完了条件" name="completion_criteria" maxLength={4000} rows={3} defaultValue={task?.completion_criteria ?? ''} className="input min-h-24" /></label>
    <label className="form-field"><span className="form-label">期限</span><input name="due_date" type="date" defaultValue={toDateInputValue(task?.due_date)} className="input" /></label>
    <label className="form-field"><span className="form-label">進捗</span><textarea aria-label="進捗" name="progress" maxLength={4000} rows={3} defaultValue={task?.progress ?? ''} className="input min-h-24" /></label>
    <label className="form-field"><span className="form-label">状態</span><select aria-label="状態" name="status" defaultValue={task?.status ?? 'open'} className="select">{Object.entries(taskStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
    {deleteError && <p role="alert" className="text-sm text-red-700">{deleteError}</p>}
    <div className="flex flex-wrap gap-3">
      <button type="submit" disabled={pending || deleting} className="btn btn--primary">{pending ? '保存中…' : task ? '保存する' : '課題を追加'}</button>
      {task && <><Link href={back} className="btn btn--secondary">キャンセル</Link><button type="button" disabled={pending || deleting} className="btn btn--secondary text-red-700" onClick={() => {
        if (!window.confirm('この課題を削除しますか？')) return
        startDelete(async () => {
          const result = await deleteTaskAction(task.id)
          if (result.error) setDeleteError(result.error)
          else { router.push(back); router.refresh() }
        })
      }}>{deleting ? '削除中…' : '削除'}</button></>}
    </div>
  </form>
}
