import 'server-only'
import { sql } from '@/lib/db'

export type AppUser = {
  id: string
  name: string
  email: string
  role: string
  is_active: boolean
}

type UserRow = AppUser & {
  login_id: string | null
  password_hash: string | null
  failed_login_count: number
  locked_until: Date | string | null
}

export type LoginUser = UserRow


export async function getUserByLoginId(loginId: string): Promise<LoginUser | null> {
  const rows = await sql`
    SELECT id, name, email, role, login_id, password_hash,
      COALESCE(is_active, true) as is_active,
      COALESCE(failed_login_count, 0)::int as failed_login_count,
      locked_until
    FROM users
    WHERE lower(login_id) = lower(${loginId}) OR lower(email) = lower(${loginId})
    LIMIT 1
  `
  return (rows[0] as LoginUser | undefined) ?? null
}

export async function getUserById(id: string): Promise<AppUser | null> {
  const rows = await sql`SELECT id, name, email, role, COALESCE(is_active, true) as is_active FROM users WHERE id = ${id} LIMIT 1`
  return (rows[0] as AppUser | undefined) ?? null
}

export async function markLoginSuccess(userId: string) {
  await sql`
    UPDATE users
    SET failed_login_count = 0,
        locked_until = NULL,
        last_login_at = now(),
        updated_at = now()
    WHERE id = ${userId}
  `
}

export async function markLoginFailure(userId: string) {
  await sql`
    UPDATE users
    SET failed_login_count = COALESCE(failed_login_count, 0) + 1,
        locked_until = CASE
          WHEN COALESCE(failed_login_count, 0) + 1 >= 5 THEN now() + interval '15 minutes'
          ELSE locked_until
        END,
        updated_at = now()
    WHERE id = ${userId}
  `
}
