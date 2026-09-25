import { z } from 'zod'

export const loginSchema = z.object({
  login_id: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(1024),
})

export const LOGIN_ERROR_MESSAGE =
  'ログインIDまたはパスワードが正しくありません'
export const LOCKED_ERROR_MESSAGE =
  '一定回数失敗したため一時的にロックされています'
