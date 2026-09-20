import { z } from 'zod'

const text = z.string().trim().min(1).max(4000)
export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}, '実在する日付を入力してください')
export const healthSchema = z.enum(['unknown', 'on_track', 'at_risk', 'blocked'])
export const operationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('progress'), current_summary: text, health: healthSchema, blockers: z.string().max(4000), next_review_date: dateOnly.nullable() }).strict(),
  z.object({ type: z.literal('strategy'), objective: text, strategy: text, rationale: text }).strict(),
  z.object({ type: z.literal('deal'), stage_id: z.string().uuid().nullable(), status: z.enum(['open', 'won', 'lost']), probability: z.number().int().min(0).max(100), amount: z.number().int().min(0).max(999999999999), expected_close_date: dateOnly.nullable() }).strict(),
  z.object({ type: z.literal('create_task'), title: z.string().trim().min(1).max(200), description: z.string().max(4000), due_date: dateOnly.nullable(), priority: z.enum(['low', 'medium', 'high']) }).strict(),
  z.object({ type: z.literal('complete_task'), task_id: z.string().uuid() }).strict(),
  z.object({ type: z.literal('activity'), summary: z.string().trim().min(1).max(500), body: z.string().max(4000), activity_date: dateOnly, activity_type: z.enum(['call', 'email', 'meeting', 'visit', 'proposal', 'estimate', 'contract', 'support', 'other']) }).strict(),
])
export const operationsSchema = z.array(operationSchema).min(1).max(10).superRefine((operations, ctx) => {
  for (const type of ['progress', 'strategy', 'deal'] as const) {
    if (operations.filter((op) => op.type === type).length > 1) ctx.addIssue({ code: 'custom', message: `${type}は1回の変更に1件までです` })
  }
  const tasks = operations.filter((op) => op.type === 'complete_task').map((op) => op.task_id)
  if (new Set(tasks).size !== tasks.length) ctx.addIssue({ code: 'custom', message: '同じタスクが重複しています' })
})
export const proposalSchema = z.object({ reason: text, operations: operationsSchema }).strict()
export const messageSchema = z.object({ requestId: z.string().uuid(), message: z.string().trim().min(1).max(6000) }).strict()
export const applySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('apply'), operations: operationsSchema }).strict(),
  z.object({ action: z.literal('reject') }).strict(),
])
export type Operation = z.infer<typeof operationSchema>
export type ProposalInput = z.infer<typeof proposalSchema>
export type Health = z.infer<typeof healthSchema>

export const healthLabels: Record<Health, string> = { unknown: '未確認', on_track: '順調', at_risk: '要注意', blocked: '停滞' }
export const operationLabels: Record<Operation['type'], string> = { progress: '進捗を更新', strategy: '方針を採用', deal: '商談情報を更新', create_task: 'タスクを追加', complete_task: 'タスクを完了', activity: '活動を記録' }
