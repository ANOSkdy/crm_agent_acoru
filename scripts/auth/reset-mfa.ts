import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'

config({ path: '.env.local', quiet: true })
const [environment, loginId, apply] = process.argv.slice(2)
if (
  !['local', 'preview', 'production'].includes(environment) ||
  !loginId ||
  (apply && apply !== '--apply')
) {
  throw Error(
    'Usage: tsx scripts/auth/reset-mfa.ts <local|preview|production> <login-id> [--apply]',
  )
}
if (!process.env.DATABASE_URL) throw Error('Database configuration missing')
const sql = neon(process.env.DATABASE_URL)
async function reset() {
  const rows = await sql`SELECT id FROM users WHERE login_id = ${loginId}`
  if (rows.length !== 1) throw Error('Expected exactly one matching user')
  if (apply !== '--apply') {
    console.log(
      'Dry run: one user matched. Verify the user identity offline before using --apply. No changes made.',
    )
    return
  }
  const userId = rows[0].id
  await sql.transaction([
    sql`DELETE FROM auth_mfa_credentials WHERE user_id = ${userId} AND environment = ${environment}`,
    sql`DELETE FROM auth_login_challenges WHERE user_id = ${userId} AND environment = ${environment}`,
    sql`UPDATE user_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = ${userId} AND auth_environment = ${environment}`,
    sql`INSERT INTO audit_logs(user_id, action, target_type, after_json) VALUES (${userId}, 'mfa_reset_by_operator', 'auth', ${JSON.stringify({ environment })})`,
  ])
  console.log(
    'OTP reset for the selected user and environment. Existing MFA sessions revoked. Initial registration is required on next login.',
  )
}
reset().catch(() => {
  console.error('OTP reset failed. No secret values are printed.')
  process.exitCode = 1
})
