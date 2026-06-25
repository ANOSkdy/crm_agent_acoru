import { z } from 'zod'

function emptyToNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const optionalTextSchema = z.preprocess(emptyToNull, z.string().nullable())

const optionalCorporateNumberSchema = z
  .preprocess(emptyToNull, z.string().regex(/^[0-9]{13}$/, '法人番号は13桁の数字で入力してください').nullable())

const optionalUrlSchema = z.preprocess(
  emptyToNull,
  z.string().url('URLの形式が正しくありません').nullable()
)

export const createCompanySchema = z.object({
  name: z.string().min(1, '会社名は必須です'),
  corporate_number: optionalCorporateNumberSchema,
  industry: optionalTextSchema,
  website_url: optionalUrlSchema,
  postal_code: optionalTextSchema,
  address: optionalTextSchema,
  phone: optionalTextSchema,
  status: z.enum(['active', 'inactive']).default('active'),
  source: optionalTextSchema,
  memo: optionalTextSchema,
})

export type CreateCompanyInput = z.infer<typeof createCompanySchema>

export const updateCompanySchema = createCompanySchema.partial()
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>
