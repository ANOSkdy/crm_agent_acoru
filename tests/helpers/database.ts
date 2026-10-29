import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'
export async function testDatabase(beforeIssueMigration?: (db: PGlite) => Promise<void>) {
  const db = new PGlite()
  await db.exec(await readFile('scripts/db/migrate.sql','utf8'))
  for (const file of (await readdir('scripts/db/migrations')).filter(f=>f.endsWith('.sql')).sort()) {
    if(file === '013_issue_management.sql' && beforeIssueMigration) await beforeIssueMigration(db)
    const content=await readFile('scripts/db/migrations/'+file,'utf8')
    if(file>='007') { for(const statement of content.split('-- statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.query(statement) }
    else await db.exec(content)
  }
  return db
}
export function adapter(db: PGlite) {
  return { query: async (q: string, p?: unknown[]) => (await db.query(q,p)).rows as Record<string,unknown>[] }
}
