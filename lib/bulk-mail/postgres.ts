import 'server-only'
import { Pool } from '@neondatabase/serverless'
import type { MailDb, QueryDb } from './repository'

// HTTP remains the default for individual reads. Interactive transactions get
// their own connection, which is always closed before returning to Vercel.
export function postgresMailDb(reads: QueryDb, connectionString: string): MailDb {
  return {
    ...reads,
    async transaction(fn) {
      const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10000 })
      try {
        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          await client.query("SET LOCAL statement_timeout='30s'")
          await client.query("SET LOCAL lock_timeout='5s'")
          const result = await fn({ query: async (q, p) => (await client.query(q, p)).rows as Record<string, unknown>[] })
          await client.query('COMMIT')
          return result
        } catch (error) {
          try { await client.query('ROLLBACK') } catch { /* Preserve original failure. */ }
          throw error
        } finally { client.release() }
      } finally { await pool.end() }
    },
  }
}
