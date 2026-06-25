import 'server-only'
import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

// Lazily create the neon client so the module can be imported at build time
// without requiring DATABASE_URL to be set.
let _sql: NeonQueryFunction<false, false> | null = null

export function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    const url = process.env.DATABASE_URL
    if (!url) {
      throw new Error('DATABASE_URL is not set')
    }
    _sql = neon(url)
  }
  return _sql
}

// Export a helper that delegates to the lazy instance
export const sql: NeonQueryFunction<false, false> = ((...args: Parameters<NeonQueryFunction<false, false>>) => {
  return getSql()(...args)
}) as NeonQueryFunction<false, false>

// Attach .unsafe so scripts can call sql.unsafe(statement)
;(sql as unknown as { unsafe: (q: string) => Promise<unknown[]> }).unsafe = (q: string) => {
  return getSql().unsafe(q) as unknown as Promise<unknown[]>
}
