import { z } from 'zod'

const optionalString = z.preprocess((value) => value === '' ? undefined : value, z.string().optional())
const optionalUuid = z.preprocess((value) => value === '' ? undefined : value, z.string().uuid().optional())

export const createFileSchema = z.object({
  company_id: optionalUuid,
  deal_id: optionalUuid,
  filename: z.string().min(1, 'ファイル名は必須です'),
  file_url: z.string().url('URLの形式が正しくありません'),
  mime_type: optionalString,
  file_type: optionalString,
})

export type CreateFileInput = z.infer<typeof createFileSchema>
export const updateFileSchema = createFileSchema
export type UpdateFileInput = z.infer<typeof updateFileSchema>
