import { z } from 'zod'

export const createTaskSchema = z.object({
  company_id: z.string().uuid().optional(),
  deal_id: z.string().uuid().optional(),
  title: z.string().min(1, 'タイトルは必須です'),
  description: z.string().optional(),
  due_date: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
})

export type CreateTaskInput = z.infer<typeof createTaskSchema>
