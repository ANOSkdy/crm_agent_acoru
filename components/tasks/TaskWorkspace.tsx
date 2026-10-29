'use client'
import { useActionState, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addTaskTabAction } from '@/lib/actions/tasks'
import type { Task, TaskTab } from '@/lib/db/queries/tasks'
import { TasksGrid } from '@/components/grid/TasksGrid'
import { TaskForm } from './TaskForm'

export function TaskWorkspace({ tabs, companies, tasks, selected, editableIds, canWrite, today, requestedCompany }: {
  tabs: TaskTab[]; companies: { id: string; name: string }[]; tasks: Task[]; selected: string;
  editableIds: string[]; canWrite: boolean; today: string; requestedCompany?: string
}) {
  const router = useRouter()
  const [state, addTab, pending] = useActionState(addTaskTabAction, {})
  const [search, setSearch] = useState('')
  const tabList = useRef<HTMLDivElement>(null)
  const available = companies.filter(c => !tabs.some(t => t.company_id === c.id) && c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  const choices = [...tabs.map(t => ({ id: t.company_id, name: t.company_name })), ...(tasks.some(t => !t.company_id) ? [{ id: 'unassigned', name: '顧客未設定' }] : [])]
  const suggested = companies.find(c => c.id === requestedCompany && !tabs.some(t => t.company_id === c.id))
  const rows = tasks.filter(t => (t.company_id ?? 'unassigned') === selected)
  return <div className="space-y-5">
    {canWrite && <form action={addTab} className="flex flex-wrap items-end gap-3 bg-white border border-gray-200 rounded-lg p-4">
      <label className="form-field w-full min-w-0 sm:w-auto"><span className="form-label">顧客名で検索</span><input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="顧客名を入力" /></label>
      <label className="form-field w-full min-w-0 sm:w-auto sm:min-w-56"><span className="form-label">追加する顧客</span><select aria-label="追加する顧客" name="company_id" className="select" required defaultValue={suggested?.id ?? ''} key={search + tabs.length + requestedCompany}>
        <option value="">登録済み顧客を選択</option>{available.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select></label>
      <button className="btn btn--primary" type="submit" disabled={pending || !available.length}>{pending ? '追加中…' : '顧客タブを追加'}</button>
      {suggested && <p className="w-full text-sm text-gray-700">{suggested.name}の顧客タブを追加してください。</p>}
      {state.error && <p role="alert" className="w-full text-sm text-red-700">{state.error}</p>}
      <p className="w-full text-xs text-gray-500">契約の有無にかかわらず登録済み顧客を追加できます。</p>
    </form>}
    {choices.length ? <>
      <div role="tablist" aria-label="顧客別の課題" ref={tabList} className="flex gap-2 overflow-x-auto border-b border-gray-200 pb-2" onKeyDown={e => {
        const buttons = Array.from(tabList.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = e.key === 'ArrowRight' ? (index + 1) % buttons.length : e.key === 'ArrowLeft' ? (index - 1 + buttons.length) % buttons.length : e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : -1
        if (next >= 0) { e.preventDefault(); buttons[next].focus(); buttons[next].click() }
      }}>
        {choices.map(c => <button type="button" key={c.id} id={'tab-' + c.id} role="tab" aria-selected={selected === c.id} aria-controls="task-panel" tabIndex={selected === c.id ? 0 : -1}
          className={`shrink-0 rounded-md px-4 py-2 text-sm ${selected === c.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          onClick={() => router.push('/tasks?company=' + c.id, { scroll: false })}>{c.name}</button>)}
      </div>
      <section id="task-panel" role="tabpanel" aria-labelledby={'tab-' + selected} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{choices.find(c => c.id === selected)?.name}の課題 <span className="text-gray-500 font-normal">({rows.length}件)</span></h2><p className="text-xs text-gray-500">Noから課題を編集できます。</p></div>
        <TasksGrid tasks={rows} editableIds={editableIds} today={today} />
        {canWrite && selected !== 'unassigned' && <details key={selected + ':' + rows.length} className="rounded-lg border border-gray-200 bg-white p-4"><summary className="cursor-pointer text-blue-600 font-medium">＋ 課題を追加</summary><div className="mt-4 max-w-3xl"><TaskForm companyId={selected} today={today} /></div></details>}
      </section>
    </> : <p className="rounded-lg bg-white border border-gray-200 p-8 text-gray-500">顧客タブを追加すると、その顧客の課題を管理できます。</p>}
  </div>
}
