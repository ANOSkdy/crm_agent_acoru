'use client'

import { useState } from 'react'
import { healthLabels, operationLabels, type Operation } from '@/lib/agent/schema'
import type { ChangeRequest } from '@/lib/agent/types'

const labels: Record<string, string> = {
  current_summary: '現在の状況', health: '進行状況', blockers: '懸念・障害', next_review_date: '次回確認日',
  objective: '目標', strategy: '採用する方針', rationale: '採用理由', stage_id: '商談ステージ', status: '商談の状態',
  probability: '受注確度（%）', amount: '案件金額（円）', expected_close_date: '受注予定日', title: 'タスク名',
  description: 'タスクの内容', due_date: '期限', priority: '優先度', summary: '活動の概要', body: '活動の内容', activity_date: '活動日', activity_type: '活動の種類',
}
const options: Record<string, Record<string, string>> = {
  health: healthLabels, status: { open: '進行中', won: '受注', lost: '失注' }, priority: { low: '低', medium: '中', high: '高' },
  activity_type: { call: '電話', email: 'メール', meeting: '会議', visit: '訪問', proposal: '提案', estimate: '見積', contract: '契約', support: 'サポート', other: 'その他' },
}
function beforeValue(proposal: ChangeRequest, op: Operation, key: string) {
  const context = proposal.before_state.context as Record<string, unknown> | null
  const deal = proposal.before_state.deal as Record<string, unknown> | undefined
  if (op.type === 'progress') return context?.[key]
  if (op.type === 'strategy') return key === 'strategy' ? context?.current_strategy : context?.[key]
  if (op.type === 'deal') return deal?.[key]
  return undefined
}
export function ChangeProposalCard({ proposal, canEdit, onChanged }: { proposal: ChangeRequest; canEdit: boolean; onChanged: () => Promise<void> }) {
  const [operations, setOperations] = useState<Operation[]>(proposal.operations)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const stages = (proposal.before_state.stages ?? []) as { id: string; name: string }[]
  const tasks = (proposal.before_state.tasks ?? []) as { id: string; title: string }[]
  const editable = proposal.status === 'pending' && canEdit && !pending
  function update(index: number, key: string, value: unknown) {
    setOperations((current) => current.map((op, i) => i === index ? { ...op, [key]: value } as Operation : op))
  }
  async function submit(action: 'apply' | 'reject') {
    setPending(true); setError('')
    try {
      const response = await fetch(`/api/agent/changes/${proposal.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action === 'apply' ? { action, operations } : { action }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '更新できませんでした')
      await onChanged()
    } catch (err) { setError(err instanceof Error ? err.message : '更新できませんでした') }
    finally { setPending(false) }
  }
  return (
    <section className="agent-proposal" aria-label="案件の更新案">
      <div className="agent-proposal__heading"><strong>更新案</strong><span>{proposal.status === 'applied' ? '反映済み' : proposal.status === 'rejected' ? '却下済み' : '内容を確認してください'}</span></div>
      <p className="agent-muted">{proposal.reason}</p>
      {operations.map((op, index) => (
        <fieldset key={index} disabled={!editable} className="agent-operation">
          <legend>{operationLabels[op.type]}</legend>
          {op.type === 'complete_task' ? <p>{tasks.find((t) => t.id === op.task_id)?.title ?? '対象タスク'}：未完了 → 完了</p> :
            Object.entries(op).filter(([key]) => key !== 'type').map(([key, value]) => {
              const id = `${proposal.id}-${index}-${key}`
              const choices = key === 'stage_id' ? Object.fromEntries(stages.map((s) => [s.id, s.name])) : options[key]
              const before = beforeValue(proposal, op, key)
              const displayBefore = before == null || before === '' ? '未設定' : choices?.[String(before)] ?? String(before)
              return <div className="agent-field" key={key}>
                <label htmlFor={id}>{labels[key] ?? key}</label>
                {['progress', 'strategy', 'deal'].includes(op.type) && key !== 'rationale' ? <p className="agent-before">変更前：{displayBefore}</p> : null}
                {choices ? <select id={id} className="input" value={String(value ?? '')} onChange={(e) => update(index, key, e.target.value || null)}>
                  {key === 'stage_id' ? <option value="">未設定</option> : null}
                  {Object.entries(choices).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select> : key.endsWith('_date') ? <input id={id} className="input" type="date" value={String(value ?? '')} onChange={(e) => update(index, key, e.target.value || null)} /> : typeof value === 'number' ?
                  <input id={id} className="input" type="number" min={0} max={key === 'probability' ? 100 : 999999999999} step={1} value={value} onChange={(e) => update(index, key, Number(e.target.value))} /> :
                  <textarea id={id} className="input" rows={2} maxLength={key === 'title' ? 200 : key === 'summary' ? 500 : 4000} value={String(value ?? '')} onChange={(e) => update(index, key, e.target.value)} />}
              </div>
            })}
        </fieldset>
      ))}
      {error ? <p role="alert" className="agent-error">{error}</p> : null}
      {proposal.status === 'pending' && canEdit ? <div className="agent-actions">
        <button className="btn btn--primary" disabled={pending} onClick={() => submit('apply')}>{pending ? '処理中…' : 'この内容で反映'}</button>
        <button className="btn btn--secondary" disabled={pending} onClick={() => submit('reject')}>却下</button>
      </div> : null}
    </section>
  )
}
