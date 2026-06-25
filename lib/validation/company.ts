import { z } from 'zod'

export const createCompanySchema = z.object({
  name: z.string().min(1, '会社名は必須です'),
  corporate_number: z.string().optional(),
  industry: z.string().optional(),
  website_url: z.string().url('URLの形式が正しくありません').optional().or(z.literal('')),
  postal_code: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
  source: z.string().optional(),
  memo: z.string().optional(),
})

export type CreateCompanyInput = z.infer<typeof createCompanySchema>

export const updateCompanySchema = createCompanySchema.partial()
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>
