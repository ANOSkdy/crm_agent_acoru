import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'

// Check the deployment's actual DB before building. Never apply migrations here.
let stage = 'configuration'
async function check() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
  const sql = neon(process.env.DATABASE_URL)
  const files = [{ name: '000_base', path: 'scripts/db/migrate.sql' },
    ...readdirSync('scripts/db/migrations').filter(name => name.endsWith('.sql')).sort()
      .map(name => ({ name, path: `scripts/db/migrations/${name}` }))]

  stage = 'migration-history'
  const applied = await sql`SELECT name, checksum FROM schema_migrations`
  const pending = files.filter(file => {
    const checksum = createHash('sha256').update(readFileSync(file.path, 'utf8').replace(/\r\n/g, '\n')).digest('hex')
    return !applied.some(row => row.name === file.name && row.checksum === checksum)
  })
  if (pending.length) {
    console.error('Database migrations are missing or changed:', pending.map(file => file.name).join(', '))
    console.error('Apply the reviewed migrations to this deployment environment before rebuilding.')
    process.exitCode = 1
    return
  }

  stage = 'issue-schema'
  await sql.transaction([
    sql`SELECT issue_number, opened_on, title, completion_criteria, due_date, progress, status FROM crm_live_tasks LIMIT 0`,
    sql`SELECT company_id, created_by, created_at FROM task_company_tabs LIMIT 0`,
  ], { readOnly: true })
  console.log(`Database schema ready: ${files.length} migrations and issue-management views verified`)
}

check().catch(error => {
  // Connection errors can contain credentials; report only the stage and SQLSTATE.
  const code = typeof error?.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : 'unknown'
  console.error(`Database schema check failed at ${stage} (${code})`)
  process.exitCode = 1
})
