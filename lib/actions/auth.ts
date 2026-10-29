'use server'
import { redirect } from 'next/navigation'
import { sql } from '@/lib/db'
import {
  createSessionToken,
  hashSessionToken,
  setSessionCookie,
  getCurrentUser,
  revokeCurrentSession,
} from '@/lib/auth/session'
import { loginRequest, mfaRepository } from '@/lib/auth/mfa'
import {
  decryptSecret,
  otpUserId,
  safeReturnTo,
  verifyCode,
} from '@/lib/auth/mfa-crypto'

export type LoginActionState = { error?: string }
export async function verifyOtpAction(
  _state: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  let returnTo = '/dashboard'
  try {
    const request = await loginRequest()
    const repo = mfaRepository()
    const userId = otpUserId()
    if (
      !(await repo.rateLimit('otp-only-ip', request.ip, 10, 300)) ||
      !(await repo.rateLimit('otp-only-user', userId, 10, 300))
    )
      return {
        error:
          '試行回数の上限に達しました。5分ほど待ってから再度お試しください。',
      }
    const credential = await repo.otpCredential(userId)
    if (!credential)
      return {
        error:
          'OTPが未登録か、現在ログインできません。管理者にご確認ください。',
      }
    const secret = decryptSecret(
      credential.secret_encrypted,
      `${repo.environment}:${userId}`,
    )
    const step = verifyCode(secret, formData.get('code'))
    if (step === null)
      return {
        error:
          '認証できませんでした。1Passwordの最新の6桁コードをご確認ください。',
      }
    const token = createSessionToken()
    if (
      !(await repo.completeOtp(
        userId,
        credential.version,
        step,
        hashSessionToken(token),
        request.userAgent,
        request.ip,
      ))
    )
      return {
        error: 'このコードは使用済みです。新しいコードで再度お試しください。',
      }
    await setSessionCookie(token)
    returnTo = safeReturnTo(formData.get('next'))
  } catch {
    return {
      error:
        '現在認証できません。時間をおいて再度お試しいただくか、管理者にご確認ください。',
    }
  }
  redirect(returnTo)
}
export async function logoutAction() {
  const user = await getCurrentUser()
  const localSession = await revokeCurrentSession()
  if (user && !localSession)
    await sql`INSERT INTO audit_logs(user_id,action,target_type) VALUES (${user.id},'logout','auth')`
  redirect('/login')
}
