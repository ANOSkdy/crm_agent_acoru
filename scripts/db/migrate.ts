import { neon } from '@neondatabase/serverless'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { config } from 'dotenv'

config({ path: join(process.cwd(), '.env.local'), quiet: true })

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set')
}

const sql = neon(DATABASE_URL)

async function migrate() {
  const directory = join(process.cwd(), 'scripts/db')
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`
  const files = [{ name: '000_base', content: readFileSync(join(directory, 'migrate.sql'), 'utf8'), base: true },
    ...readdirSync(join(directory, 'migrations')).filter((name) => name.endsWith('.sql')).sort().map((name) => ({ name, content: readFileSync(join(directory, 'migrations', name), 'utf8'), base: false }))]
  for (const file of files) {
    const checksum = createHash('sha256').update(file.content.replace(/\r\n/g, '\n')).digest('hex')
    const applied = await sql`SELECT checksum FROM schema_migrations WHERE name = ${file.name}`
    if (applied.length) {
      if (applied[0].checksum !== checksum) throw new Error(`Migration checksum mismatch: ${file.name}`)
      console.log(`Already applied: ${file.name}`)
      continue
    }
    const statements = file.content.split(file.base ? ';' : '-- statement-breakpoint').map((s) => s.trim()).filter(Boolean)
    await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(9826174)`, sql`SET LOCAL lock_timeout = '5s'`,
      ...statements.map((statement) => sql.query(statement)),
      sql`INSERT INTO schema_migrations(name, checksum) VALUES (${file.name}, ${checksum})`,
    ])
    console.log(`Applied: ${file.name}`)
  }
}

migrate().catch((err) => {
  console.error('Migration failed', { code: typeof err?.code === 'string' ? err.code : 'unknown' })
  process.exit(1)
})
