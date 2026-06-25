import { z } from 'zod'

export const createActivitySchema = z.object({
  company_id: z.string().uuid('会社IDが無効です'),
  contact_id: z.string().uuid().optional(),
  deal_id: z.string().uuid().optional(),
  type: z.enum(['call', 'email', 'meeting', 'visit', 'other']),
  activity_date: z.string().min(1, '活動日は必須です'),
  summary: z.string().min(1, '概要は必須です'),
  body: z.string().optional(),
  next_action: z.string().optional(),
})

export type CreateActivityInput = z.infer<typeof createActivitySchema>
