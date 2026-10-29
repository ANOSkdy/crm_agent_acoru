import 'server-only'
import { cookies, headers } from 'next/headers'
import { getSql } from '@/lib/db'
import { getUserById, type AppUser } from '@/lib/db/queries/users'
import { LOCAL_SESSION_COOKIE, LOCAL_SESSION_SECONDS, LocalAuthSessions, matchesLocalKey } from './local-auth'
import { localAuthEnabled, localLoginRequest } from './local-policy'

const local = globalThis as typeof globalThis & { acoruLocalAuth?: LocalAuthSessions }
const sessions = local.acoruLocalAuth ??= new LocalAuthSessions()

export async function localAuthAvailable() {
  if (process.env.LOCAL_AUTH_ENABLED !== 'true') return false
  return localAuthEnabled(process.env, (await headers()).get('host'))
}
export async function localUser(): Promise<AppUser | null> {
  if (!(await localAuthAvailable())) return null
  const token = (await cookies()).get(LOCAL_SESSION_COOKIE)?.value
  if (!token) return null
  const userId = sessions.userId(token, process.env.LOCAL_AUTH_KEY!)
  if (!userId) return null
  const user = await getUserById(userId)
  return user?.is_active && user.role === 'admin' ? user : null
}
export async function loginLocal(value: unknown) {
  const h = await headers()
  if (!localLoginRequest(process.env, h.get('host'), h.get('origin'), h.get('sec-fetch-site'))) return { error: 'ローカル仮認証はこの環境では利用できません。' }
  if (!sessions.attempt()) return { error: '試行回数の上限です。5分後にお試しください。' }
  if (!matchesLocalKey(value, process.env.LOCAL_AUTH_KEY!)) return { error: 'ローカル仮認証キーが違います。' }
  // Reuse the one active administrator without creating users, credentials or DB sessions.
  const users = await getSql().query("SELECT id FROM users WHERE is_active=true AND role='admin' ORDER BY id LIMIT 2")
  if (users.length !== 1) return { error: '有効な管理者が1名の環境でのみ仮認証を利用できます。' }
  const token = sessions.create(String(users[0].id), process.env.LOCAL_AUTH_KEY!)
  ;(await cookies()).set(LOCAL_SESSION_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: false, path: '/', maxAge: LOCAL_SESSION_SECONDS })
  return { ok: true }
}
export async function revokeLocalSession() {
  if (!(await localAuthAvailable())) return false
  const store = await cookies()
  const token = store.get(LOCAL_SESSION_COOKIE)?.value
  if (!token) return false
  sessions.revoke(token)
  store.set(LOCAL_SESSION_COOKIE, '', { httpOnly: true, sameSite: 'strict', secure: false, path: '/', maxAge: 0 })
  return true
}
