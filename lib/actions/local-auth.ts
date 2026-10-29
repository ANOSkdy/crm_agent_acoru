'use server'

import { redirect } from 'next/navigation'
import { loginLocal } from '@/lib/auth/local-session'
import { safeReturnTo } from '@/lib/auth/mfa-crypto'

export async function verifyLocalKeyAction(_state: { error?: string }, data: FormData): Promise<{ error?: string }> {
  try {
    const result = await loginLocal(data.get('local_key'))
    if (result.error) return { error: result.error }
  } catch { return { error: 'ローカル認証を完了できませんでした。DB接続を確認してください。' } }
  redirect(safeReturnTo(data.get('next')))
}
