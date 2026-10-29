import { z } from 'zod'
import { dateOnly } from './date'
export const taskStatusLabels = { open: '未着手', in_progress: '対応中', done: '完了', not_needed: '不要' } as const
export const taskStatusSchema = z.enum(['open', 'in_progress', 'done', 'not_needed'])
const optionalUuid = z.preprocess(value => value === '' || value === null ? undefined : value, z.uuid().optional())
const optionalDate = z.preprocess(value => value === '' || value === undefined ? null : value, dateOnly.nullable())
const issueNumber = z.coerce.number().int().min(1, 'Noは1以上の整数で入力してください').max(2147483647)
export const taskFieldsSchema = z.object({
  issue_number: issueNumber, opened_on: dateOnly,
  title: z.string().trim().min(1, '内容は必須です').max(4000),
  completion_criteria: z.string().max(4000).default(''),
  due_date: optionalDate, progress: z.string().max(4000).default(''),
  status: taskStatusSchema.default('open'),
})
export const createTaskSchema = taskFieldsSchema.extend({
  issue_number: z.preprocess(value => value === '' || value === undefined ? undefined : value, issueNumber.optional()),
  company_id: z.uuid('顧客を選択してください'),
})
export const updateTaskSchema = taskFieldsSchema.extend({ company_id: optionalUuid })
export type CreateTaskInput = z.infer<typeof createTaskSchema>
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>
