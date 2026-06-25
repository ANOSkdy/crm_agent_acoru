import { z } from 'zod'

export const createFileSchema = z.object({
  company_id: z.string().uuid().optional(),
  deal_id: z.string().uuid().optional(),
  filename: z.string().min(1, 'ファイル名は必須です'),
  file_url: z.string().url('URLの形式が正しくありません'),
  mime_type: z.string().optional(),
  file_type: z.string().optional(),
})

export type CreateFileInput = z.infer<typeof createFileSchema>
