import 'server-only'
import { sql } from '@/lib/db'
import type { AppUser } from '@/lib/db/queries/users'

export type ActiveSession = {
  id: string
  user_id: string
  expires_at: Date | string
  user: AppUser
}

export async function createSession(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
  userAgent?: string,
  ipAddress?: string,
) {
  await sql`
    INSERT INTO user_sessions (user_id, token_hash, expires_at, user_agent, ip_address)
    VALUES (${userId}, ${tokenHash}, ${expiresAt.toISOString()}, ${userAgent ?? null}, ${ipAddress ?? null})
  `
}

export async function getActiveSessionByTokenHash(tokenHash: string): Promise<ActiveSession | null> {
  const rows = await sql`
    SELECT s.id as session_id, s.user_id as session_user_id, s.expires_at,
      u.id as user_id, u.name, u.email, u.role, COALESCE(u.is_active, true) as is_active
    FROM user_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash}
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
      AND COALESCE(u.is_active, true) = true
    LIMIT 1
  `
  const row = rows[0] as (Record<string, unknown> | undefined)
  if (!row) return null

  return {
    id: row.session_id as string,
    user_id: row.session_user_id as string,
    expires_at: row.expires_at as Date | string,
    user: {
      id: row.user_id as string,
      name: row.name as string,
      email: row.email as string,
      role: row.role as string,
      is_active: row.is_active as boolean,
    },
  }
}

export async function touchSession(tokenHash: string) {
  await sql`UPDATE user_sessions SET last_seen_at = now() WHERE token_hash = ${tokenHash}`
}

export async function revokeSessionByTokenHash(tokenHash: string) {
  await sql`
    UPDATE user_sessions
    SET revoked_at = COALESCE(revoked_at, now())
    WHERE token_hash = ${tokenHash}
  `
}
