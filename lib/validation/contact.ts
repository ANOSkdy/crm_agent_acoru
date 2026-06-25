import { z } from 'zod'

const optionalString = z.preprocess((value) => value === '' ? undefined : value, z.string().optional())
const optionalEmail = z.preprocess((value) => value === '' ? undefined : value, z.string().email('メールアドレスの形式が正しくありません').optional())

export const createContactSchema = z.object({
  company_id: z.string().uuid('会社IDが無効です'),
  name: z.string().min(1, '氏名は必須です'),
  department: optionalString,
  position: optionalString,
  email: optionalEmail,
  phone: optionalString,
  is_decision_maker: z.boolean().default(false),
  memo: optionalString,
})

export type CreateContactInput = z.infer<typeof createContactSchema>

export const updateContactSchema = createContactSchema
export type UpdateContactInput = z.infer<typeof updateContactSchema>
