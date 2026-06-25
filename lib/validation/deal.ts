import { z } from 'zod'

const optionalString = z.preprocess((value) => value === '' ? undefined : value, z.string().optional())
const optionalUuid = z.preprocess((value) => value === '' ? undefined : value, z.string().uuid().optional())

export const createDealSchema = z.object({
  company_id: z.string().uuid('会社IDが無効です'),
  title: z.string().min(1, '案件名は必須です'),
  amount: z.coerce.number().min(0).default(0),
  stage_id: optionalUuid,
  probability: z.coerce.number().min(0).max(100).default(0),
  expected_close_date: optionalString,
  status: z.enum(['open', 'won', 'lost']).optional(),
  memo: optionalString,
})

export type CreateDealInput = z.infer<typeof createDealSchema>

export const updateDealSchema = createDealSchema.omit({ company_id: true }).extend({ company_id: z.string().uuid().optional() })
export type UpdateDealInput = z.infer<typeof updateDealSchema>
