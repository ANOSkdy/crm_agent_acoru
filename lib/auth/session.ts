import 'server-only'
import { randomBytes, createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  getActiveSessionByTokenHash,
  revokeSessionByTokenHash,
  touchSession,
} from '@/lib/db/queries/sessions'
import type { AppUser } from '@/lib/db/queries/users'
import { authEnvironment, encryptionKey, SESSION_SECONDS } from './mfa-crypto'

export const SESSION_COOKIE_NAME = 'acoru_session'
export const SESSION_MAX_AGE_SECONDS = SESSION_SECONDS
const SESSION_DURATION_MS = SESSION_MAX_AGE_SECONDS * 1000

export function createSessionToken() {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function getSessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    expires,
    maxAge: SESSION_MAX_AGE_SECONDS,
  }
}

function getExpiredCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    expires: new Date(0),
    maxAge: 0,
  }
}

export async function getCurrentUser(): Promise<AppUser | null> {
  try {
    encryptionKey()
  } catch {
    return null
  }
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!token) return null

  const tokenHash = hashSessionToken(token)
  const session = await getActiveSessionByTokenHash(
    tokenHash,
    authEnvironment(),
  )
  if (!session) return null

  await touchSession(tokenHash)
  return session.user
}

export async function requireCurrentUser(): Promise<AppUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

export async function setSessionCookie(token: string) {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)
  const cookieStore = await cookies()
  cookieStore.set(
    SESSION_COOKIE_NAME,
    token,
    getSessionCookieOptions(expiresAt),
  )
}

export async function revokeCurrentSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (token) {
    await revokeSessionByTokenHash(hashSessionToken(token))
  }
  cookieStore.set(SESSION_COOKIE_NAME, '', getExpiredCookieOptions())
}
