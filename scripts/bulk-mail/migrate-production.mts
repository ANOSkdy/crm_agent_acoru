import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { parse } from 'dotenv'
import { neon } from '@neondatabase/serverless'

// Applies only this additive mail migration, never the unrelated pending files.
const name = '012_bulk_mail.sql'
const project = JSON.parse(await readFile('.vercel/project.json', 'utf8'))
if (project.projectId !== 'prj_JNPnHxHEPrpPUlLpBLeua9y4V7mc') throw new Error('Unexpected deployment project')
const env = parse(await readFile('.env.production.local'))
if (!env.DATABASE_URL || env.VERCEL_ENV !== 'production') throw new Error('Production database configuration required')
const sql = neon(env.DATABASE_URL)
const content = await readFile(`scripts/db/migrations/${name}`, 'utf8')
const checksum = createHash('sha256').update(content.replace(/\r\n/g, '\n')).digest('hex')
const [applied, tables] = await sql.transaction([
  sql.query('SELECT checksum FROM schema_migrations WHERE name=$1', [name]),
  sql.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'mail_%'"),
], { readOnly: true })
if (applied.length) {
  if (applied[0].checksum !== checksum) throw new Error('Migration checksum mismatch')
  console.log(JSON.stringify({ project: project.projectName, migration: name, status: 'already_applied' }))
} else if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ project: project.projectName, migration: name, status: 'prepared', existingMailTables: tables[0].count, statements: content.split('-- statement-breakpoint').length }))
} else {
  await sql.transaction([
    sql.query('SELECT pg_advisory_xact_lock(9826174)'),
    sql.query("SET LOCAL lock_timeout='5s'"),
    ...content.split('-- statement-breakpoint').map(s => s.trim()).filter(Boolean).map(s => sql.query(s)),
    sql.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [name, checksum]),
  ])
  console.log(JSON.stringify({ project: project.projectName, migration: name, status: 'applied', emailsSent: 0 }))
}
