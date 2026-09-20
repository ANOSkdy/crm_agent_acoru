import { readFileSync } from 'node:fs'
import { parse } from 'dotenv'
import { neon } from '@neondatabase/serverless'

async function main() {
  const local = parse(readFileSync('.env.local'))
  const production = parse(readFileSync('.env.production.local'))
  const url = new URL(local.DATABASE_URL)
  console.log(JSON.stringify({ database: url.pathname.slice(1), matchesProduction: local.DATABASE_URL === production.DATABASE_URL }))
  const sql = neon(local.DATABASE_URL)
  const columns = await sql`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`
  const roles = await sql`SELECT role, count(*)::int AS count FROM users GROUP BY role`
  const owners = await sql`SELECT count(*)::int AS total, count(owner_user_id)::int AS assigned FROM deals WHERE deleted_at IS NULL`
  console.log(JSON.stringify({ columns, roles, owners }))
}
main().catch(() => { console.error('Database inspection failed (credentials suppressed)'); process.exitCode = 1 })
