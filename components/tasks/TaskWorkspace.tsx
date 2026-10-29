'use client'
import { useActionState, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addTaskTabAction } from '@/lib/actions/tasks'
import type { Task, TaskTab } from '@/lib/db/queries/tasks'
import { taskStatusLabels } from '@/lib/validation/task'
import { TasksGrid } from '@/components/grid/TasksGrid'
import { TaskForm } from './TaskForm'

export function TaskWorkspace({ tabs, companies, tasks, selected, editableIds, canWrite, today, requestedCompany }: {
  tabs: TaskTab[]; companies: { id: string; name: string }[]; tasks: Task[]; selected: string;
  editableIds: string[]; canWrite: boolean; today: string; requestedCompany?: string
}) {
  const router = useRouter()
  const [state, addTab, pending] = useActionState(addTaskTabAction, {})
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const tabList = useRef<HTMLDivElement>(null)
  const available = companies.filter(c => !tabs.some(t => t.company_id === c.id) && c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  const choices = [...tabs.map(t => ({ id: t.company_id, name: t.company_name })), ...(tasks.some(t => !t.company_id) ? [{ id: 'unassigned', name: '顧客未設定' }] : [])]
  const suggested = companies.find(c => c.id === requestedCompany && !tabs.some(t => t.company_id === c.id))
  const companyRows = tasks.filter(t => (t.company_id ?? 'unassigned') === selected)
  const needle = query.trim().toLocaleLowerCase()
  const rows = companyRows.filter(t => (!status || t.status === status)
    && (!needle || [t.issue_number, t.title, t.completion_criteria, t.progress].some(v => String(v ?? '').toLocaleLowerCase().includes(needle))))
  const counts = new Map(choices.map(c => [c.id, tasks.filter(t => (t.company_id ?? 'unassigned') === c.id && ['open', 'in_progress'].includes(t.status)).length]))
  return <div className="workspace">
    <div className="workspace__bar">
      <h1 className="workspace__title">課題管理</h1>
      {choices.length ? <>
        <label className="crm-grid__search">
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="7" cy="7" r="5" /><path d="m11 11 3.5 3.5" strokeLinecap="round" /></svg>
          <input type="search" aria-label="課題を検索" placeholder="No・内容・完了条件・進捗" value={query} onChange={e => setQuery(e.target.value)} />
        </label>
        <select aria-label="状態で絞り込み" className={`crm-grid__filter-input task-filter${status ? ' crm-grid__filter-input--active' : ''}`} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">すべての状態</option>
          {Object.entries(taskStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {query || status ? <button type="button" className="crm-grid__clear" onClick={() => { setQuery(''); setStatus('') }}>条件をクリア</button> : null}
      </> : null}
      <span className="workspace__spacer" />
      {canWrite && <form action={addTab} className="task-tab-form">
        <label className="task-tab-form__search"><span className="sr-only">顧客名で検索</span><input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="顧客名で検索" aria-label="顧客名で検索" /></label>
        <select aria-label="追加する顧客" name="company_id" className="select" required defaultValue={suggested?.id ?? ''} key={search + tabs.length + requestedCompany}>
          <option value="">登録済み顧客を選択</option>{available.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn btn--sm" type="submit" disabled={pending || !available.length} title="契約の有無にかかわらず登録済み顧客を追加できます。">{pending ? '追加中…' : '顧客タブを追加'}</button>
      </form>}
      {canWrite && choices.length > 0 && selected !== 'unassigned' && <details key={selected + ':' + companyRows.length} className="popover">
        <summary className="btn btn--sm btn--primary">＋ 課題を追加</summary>
        <div className="popover__panel"><TaskForm companyId={selected} today={today} /></div>
      </details>}
      {(suggested || state.error) && <div className="workspace__notes">
        {suggested && <p>{suggested.name}の顧客タブを追加してください。</p>}
        {state.error && <p role="alert" className="is-error">{state.error}</p>}
      </div>}
    </div>
    {choices.length ? <>
      <div role="tablist" aria-label="顧客別の課題" ref={tabList} className="workspace__tabs" onKeyDown={e => {
        const buttons = Array.from(tabList.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = e.key === 'ArrowRight' ? (index + 1) % buttons.length : e.key === 'ArrowLeft' ? (index - 1 + buttons.length) % buttons.length : e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : -1
        if (next >= 0) { e.preventDefault(); buttons[next].focus(); buttons[next].click() }
      }}>
        {choices.map(c => <button type="button" key={c.id} id={'tab-' + c.id} role="tab" aria-selected={selected === c.id} aria-controls="task-panel" tabIndex={selected === c.id ? 0 : -1}
          aria-label={c.name} className="sheet-tab"
          onClick={() => router.push('/tasks?company=' + c.id, { scroll: false })}>{c.name}{counts.get(c.id) ? <span className="sheet-tab__count" aria-hidden="true">{counts.get(c.id)}</span> : null}</button>)}
      </div>
      <section id="task-panel" role="tabpanel" aria-labelledby={'tab-' + selected} className="workspace__body">
        <TasksGrid tasks={rows} total={companyRows.length} editableIds={editableIds} today={today} />
      </section>
    </> : <div className="workspace__body workspace__body--padded"><p className="panel panel__body" style={{ color: 'var(--color-text-sub)' }}>顧客タブを追加すると、その顧客の課題を管理できます。</p></div>}
  </div>
}
