import { z } from 'zod'

const optionalString = z.preprocess((value) => value === '' ? undefined : value, z.string().optional())
const optionalUuid = z.preprocess((value) => value === '' ? undefined : value, z.string().uuid().optional())

export const createActivitySchema = z.object({
  company_id: z.string().uuid('会社IDが無効です'),
  contact_id: optionalUuid,
  deal_id: optionalUuid,
  type: z.enum(['call', 'email', 'meeting', 'visit', 'other']),
  activity_date: z.string().min(1, '活動日は必須です'),
  summary: z.string().min(1, '概要は必須です'),
  body: optionalString,
  next_action: optionalString,
})

export type CreateActivityInput = z.infer<typeof createActivitySchema>
export const updateActivitySchema = createActivitySchema
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>
