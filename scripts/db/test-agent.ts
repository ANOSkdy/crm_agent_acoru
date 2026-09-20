import { neon } from '@neondatabase/serverless'
import { readFileSync, readdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing')
  const sql = neon(process.env.DATABASE_URL)
  const schema = `agent_test_${randomBytes(6).toString('hex')}`
  const statements = [
    `CREATE SCHEMA ${schema}`, `SET LOCAL search_path TO ${schema}`,
    ...readFileSync('scripts/db/migrate.sql', 'utf8').split(';'),
    ...readdirSync('scripts/db/migrations').filter(name=>name.endsWith('.sql')).sort().flatMap(name=>readFileSync(`scripts/db/migrations/${name}`,'utf8').split('-- statement-breakpoint')),
    readFileSync('tests/agent-database.sql', 'utf8'),
    readFileSync('tests/assistant-database.sql', 'utf8'),
    `DROP SCHEMA ${schema} CASCADE`,
  ].map((s) => s.trim()).filter(Boolean)
  // Schema creation, fixture data, assertions and cleanup share one transaction.
  // On failure the entire transaction rolls back; public business data is untouched.
  await sql.transaction(statements.map((s) => sql.query(s)))
  console.log('PASS: isolated migrations, permissions, atomic apply, duplicate apply, stale edits, cross-deal rejection, rollback, owner apply')
}
main().catch((error) => {
  console.error('Database test failed', { code: error?.code, message: error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]') : 'unknown' })
  process.exitCode = 1
})
