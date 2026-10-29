import 'server-only'
import { cookies, headers } from 'next/headers'
import { getSql } from '@/lib/db'
import { authEnvironment, encryptionKey, MFA_COOKIE } from './mfa-crypto'
import { MfaRepository } from './mfa-repository'

export function mfaRepository() {
  encryptionKey()
  return new MfaRepository(
    { query: (text, params) => getSql().query(text, params) },
    authEnvironment(),
  )
}

export async function pendingChallenge(reserveAttempt = false) {
  const token = (await cookies()).get(MFA_COOKIE)?.value
  return token ? mfaRepository().challenge(token, reserveAttempt) : null
}

export async function loginRequest() {
  const h = await headers()
  const origin = h.get('origin')
  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (!origin || !host || new URL(origin).host !== host)
    throw Error('Invalid origin')
  const ip = (
    h.get('x-vercel-forwarded-for') ??
    h.get('x-forwarded-for') ??
    'unknown'
  )
    .split(',')[0]
    .trim()
  return { ip, userAgent: h.get('user-agent') }
}
