'use server'

import { redirect } from 'next/navigation'
import { sql } from '@/lib/db'
import { verifyPassword } from '@/lib/auth/password'
import { createUserSession, getCurrentUser, revokeCurrentSession } from '@/lib/auth/session'
import { getUserByLoginId, markLoginFailure, markLoginSuccess } from '@/lib/db/queries/users'
import { LOGIN_ERROR_MESSAGE, LOCKED_ERROR_MESSAGE, loginSchema } from '@/lib/validation/auth'

export type LoginActionState = {
  error?: string
}

async function insertAuditLog(action: string, userId?: string, metadata?: Record<string, unknown>) {
  await sql`
    INSERT INTO audit_logs (user_id, action, target_type, after_json)
    VALUES (${userId ?? null}, ${action}, 'auth', ${metadata ? JSON.stringify(metadata) : null})
  `
}

export async function loginAction(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const parsed = loginSchema.safeParse({
    login_id: formData.get('login_id'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: LOGIN_ERROR_MESSAGE }
  }

  const { login_id: loginId, password } = parsed.data
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

  await markLoginSuccess(user.id)
  await createUserSession(user.id)
  await insertAuditLog('login_success', user.id)

  redirect('/dashboard')
}

export async function logoutAction() {
  const user = await getCurrentUser()
  await revokeCurrentSession()

  if (user) {
    await insertAuditLog('logout', user.id)
  }

  redirect('/login')
}
