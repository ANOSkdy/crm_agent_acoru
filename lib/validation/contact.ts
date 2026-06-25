import { z } from 'zod'

export const createContactSchema = z.object({
  company_id: z.string().uuid('会社IDが無効です'),
  name: z.string().min(1, '氏名は必須です'),
  department: z.string().optional(),
  position: z.string().optional(),
  email: z.string().email('メールアドレスの形式が正しくありません').optional().or(z.literal('')),
  phone: z.string().optional(),
  is_decision_maker: z.boolean().default(false),
  memo: z.string().optional(),
})

export type CreateContactInput = z.infer<typeof createContactSchema>

export const updateContactSchema = createContactSchema.partial()
export type UpdateContactInput = z.infer<typeof updateContactSchema>
