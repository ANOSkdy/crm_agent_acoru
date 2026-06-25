import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'fs'
import { join } from 'path'
import { config } from 'dotenv'

config({ path: join(process.cwd(), '.env.local') })

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set')
}

const sql = neon(DATABASE_URL)

async function migrate() {
  const sqlFile = readFileSync(join(__dirname, 'migrate.sql'), 'utf-8')
  // Split on semicolons but skip empty statements
  const statements = sqlFile
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  for (const statement of statements) {
    console.log('Running:', statement.slice(0, 60) + '...')
    // Use tagged template with the statement as a literal
    await sql.unsafe(statement)
  }

  console.log('Migration complete.')
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
