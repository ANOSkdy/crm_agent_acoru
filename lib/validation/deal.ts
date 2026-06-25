import { z } from 'zod'

export const createDealSchema = z.object({
  company_id: z.string().uuid('会社IDが無効です'),
  title: z.string().min(1, '案件名は必須です'),
  amount: z.coerce.number().min(0).default(0),
  stage_id: z.string().uuid().optional(),
  probability: z.coerce.number().min(0).max(100).default(0),
  expected_close_date: z.string().optional(),
  memo: z.string().optional(),
})

export type CreateDealInput = z.infer<typeof createDealSchema>

export const updateDealSchema = createDealSchema.partial()
export type UpdateDealInput = z.infer<typeof updateDealSchema>
