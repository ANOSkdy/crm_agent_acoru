'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { sql } from '@/lib/db'
import { verifyPassword } from '@/lib/auth/password'
import {
  createSessionToken,
  hashSessionToken,
  setSessionCookie,
  getCurrentUser,
  revokeCurrentSession,
} from '@/lib/auth/session'
import { getUserByLoginId, markLoginFailure } from '@/lib/db/queries/users'
import {
  LOGIN_ERROR_MESSAGE,
  LOCKED_ERROR_MESSAGE,
  loginSchema,
} from '@/lib/validation/auth'
import { loginRequest, mfaRepository, pendingChallenge } from '@/lib/auth/mfa'
import {
  authEnvironment,
  CHALLENGE_SECONDS,
  decryptSecret,
  encryptSecret,
  MFA_COOKIE,
  newSecret,
  safeReturnTo,
  verifyCode,
} from '@/lib/auth/mfa-crypto'

export type LoginActionState = {
  error?: string
}

async function insertAuditLog(
  action: string,
  userId?: string,
  metadata?: Record<string, unknown>,
) {
  await sql`
    INSERT INTO audit_logs (user_id, action, target_type, after_json)
    VALUES (${userId ?? null}, ${action}, 'auth', ${metadata ? JSON.stringify(metadata) : null})
  `
}

export async function loginAction(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  let returnTo = '/dashboard'
  try {
    const request = await loginRequest()
    const repo = mfaRepository()
    if (
      !(await repo.rateLimit('password-ip', request.ip, 50)) ||
      !(await repo.rateLimit('password-global', 'all', 500))
    ) {
      return { error: LOCKED_ERROR_MESSAGE }
    }
    const parsed = loginSchema.safeParse({
      login_id: formData.get('login_id'),
      password: formData.get('password'),
    })

    if (!parsed.success) {
      return { error: LOGIN_ERROR_MESSAGE }
    }

    const { login_id: loginId, password } = parsed.data
    if (!(await repo.rateLimit('password-account', loginId.toLowerCase(), 10)))
      return { error: LOCKED_ERROR_MESSAGE }
    const user = await getUserByLoginId(loginId)

    if (!user) {
      await insertAuditLog('login_failed', undefined, { login_id: loginId })
      return { error: LOGIN_ERROR_MESSAGE }
    }

    if (!user.is_active) {
      await insertAuditLog('login_failed', user.id, { reason: 'inactive' })
      return { error: LOGIN_ERROR_MESSAGE }
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      await insertAuditLog('login_failed', user.id, { reason: 'locked' })
      return { error: LOCKED_ERROR_MESSAGE }
    }

    const verified = await verifyPassword(password, user.password_hash)
    if (!verified) {
      await markLoginFailure(user.id)
      await insertAuditLog('login_failed', user.id)
      return { error: LOGIN_ERROR_MESSAGE }
    }

    returnTo = safeReturnTo(formData.get('next'))
    const environment = authEnvironment()
    const token = await repo.begin(
      user.id,
      encryptSecret(newSecret(), `${environment}:${user.id}`),
      returnTo,
    )
    const cookieStore = await cookies()
    cookieStore.set(MFA_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: CHALLENGE_SECONDS,
    })
    await repo.cleanup()
  } catch {
    return {
      error:
        '現在ログインできません。時間をおいて再度お試しいただくか、管理者にご確認ください。',
    }
  }
  redirect('/login/verify')
}

export async function verifyOtpAction(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  let returnTo = '/dashboard'
  try {
    const request = await loginRequest()
    const repo = mfaRepository()
    if (!(await repo.rateLimit('otp-ip', request.ip, 50)))
      return { error: LOCKED_ERROR_MESSAGE }
    const challenge = await pendingChallenge(true)
    if (!challenge)
      return {
        error:
          '認証の有効期限が切れたか、試行回数の上限に達しました。ログインからやり直してください。',
      }
    if (!(await repo.rateLimit('otp-user', challenge.user_id, 10)))
      return { error: LOCKED_ERROR_MESSAGE }
    const secret = decryptSecret(
      challenge.secret_encrypted,
      `${repo.environment}:${challenge.user_id}`,
    )
    const step = verifyCode(secret, formData.get('code'))
    if (step === null)
      return {
        error:
          '認証できませんでした。1Passwordの最新の6桁コードをご確認ください。',
      }
    const sessionToken = createSessionToken()
    const completed = await repo.complete(
      challenge,
      step,
      hashSessionToken(sessionToken),
      request.userAgent,
      request.ip,
    )
    if (!completed)
      return {
        error:
          'このコードは使用済みか有効期限切れです。新しいコードで再度お試しください。',
      }
    await setSessionCookie(sessionToken)
    ;(await cookies()).set(MFA_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    })
    returnTo = safeReturnTo(challenge.return_to)
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
  await revokeCurrentSession()

  if (user) {
    await insertAuditLog('logout', user.id)
  }

  redirect('/login')
}
