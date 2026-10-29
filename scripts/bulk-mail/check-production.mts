import { Pool, neon } from '@neondatabase/serverless'
import { assertLiveMail } from '../../lib/bulk-mail/live-send'
import { manualTestSettings } from '../../lib/bulk-mail/manual-test'
import { localAuthEnabled } from '../../lib/auth/local-policy'

// Runs inside the production build with existing secrets. Read-only; no mail API.
if (process.env.VERCEL_ENV !== 'production') {
  console.log('Production mail preflight skipped outside production')
  process.exit(0)
}
assertLiveMail(process.env)
const settings = manualTestSettings(process.env)
if (!settings.canSend) throw new Error('Manual test settings are incomplete')
if (localAuthEnabled(process.env, new URL(process.env.BULK_MAIL_ORIGIN!).host)) throw new Error('Local authentication must never be enabled in production')
const sql = neon(process.env.DATABASE_URL!)
const [schema] = await sql.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('mail_campaigns','mail_deliveries','mail_stops','mail_events','mail_customer_addresses','mail_manual_tests')")
if (schema.count !== 6) throw new Error('Mail migration is missing')
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 })
try {
  const client = await pool.connect()
  try { await client.query('BEGIN READ ONLY'); await client.query('SELECT id FROM mail_campaigns LIMIT 1'); await client.query('ROLLBACK') } finally { client.release() }
} finally { await pool.end() }
console.log(JSON.stringify({ bulkMail: 'manual_live', persistentTables: schema.count, interactiveTransactions: 'verified', manualTest: 'configured', localAuth: 'disabled', emailsSentByCheck: 0 }))
