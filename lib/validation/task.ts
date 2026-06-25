import { z } from 'zod'

const optionalString = z.preprocess((value) => value === '' ? undefined : value, z.string().optional())
const optionalUuid = z.preprocess((value) => value === '' ? undefined : value, z.string().uuid().optional())

export const createTaskSchema = z.object({
  company_id: optionalUuid,
  deal_id: optionalUuid,
  title: z.string().min(1, 'タイトルは必須です'),
  description: optionalString,
  due_date: optionalString,
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  status: z.enum(['open', 'done']).optional(),
})

export type CreateTaskInput = z.infer<typeof createTaskSchema>
export const updateTaskSchema = createTaskSchema
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>
