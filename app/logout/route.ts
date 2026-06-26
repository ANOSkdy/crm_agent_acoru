import { redirect } from 'next/navigation'
import { sql } from '@/lib/db'
import { getCurrentUser, revokeCurrentSession } from '@/lib/auth/session'

export async function GET() {
  const user = await getCurrentUser()
  await revokeCurrentSession()

  if (user) {
    await sql`
      INSERT INTO audit_logs (user_id, action, target_type)
      VALUES (${user.id}, 'logout', 'auth')
    `
  }

  redirect('/login')
}
