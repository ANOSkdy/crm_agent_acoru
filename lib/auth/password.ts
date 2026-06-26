import 'server-only'
import { sql } from '@/lib/db'

export async function verifyPassword(password: string, passwordHash: string | null): Promise<boolean> {
  if (!passwordHash) return false

  const rows = await sql`
    SELECT crypt(${password}, ${passwordHash}) = ${passwordHash} AS verified
  `

  return Boolean((rows[0] as { verified?: boolean } | undefined)?.verified)
}
