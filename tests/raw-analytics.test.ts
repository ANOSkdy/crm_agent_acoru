import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { testDatabase,adapter } from './helpers/database'
import { formatDisplayDate,toDateTimeLocalInputValue,normalizeBusinessDateTime } from '../lib/utils/date'
test('report/search live populations agree; deleted parents excluded, JST date preserved',async()=>{
 const db=await testDatabase();try{
 const sql=adapter(db),company=randomUUID(),deal=randomUUID()
 await sql.query("INSERT INTO companies(id,name) VALUES($1,'Analytics')",[company])
 await sql.query("INSERT INTO deals(id,company_id,title) VALUES($1,$2,'Deal')",[deal,company])
 await sql.query("INSERT INTO tasks(company_id,deal_id,title,due_date) VALUES($1,$2,'Task','2026-09-30')",[company,deal])
 for(const view of ['crm_live_deals','crm_live_tasks'])assert.equal((await sql.query('SELECT count(*)::int n FROM '+view))[0].n,1)
 await sql.query('UPDATE companies SET deleted_at=now() WHERE id=$1',[company])
 for(const view of ['crm_live_deals','crm_live_tasks'])assert.equal((await sql.query('SELECT count(*)::int n FROM '+view))[0].n,0)
 }finally{await db.close()}
})
test('JST display and manual datetime-local roundtrip',()=>{
 assert.equal(formatDisplayDate('2026-09-29T15:00:00Z'),'2026-09-30')
 assert.equal(toDateTimeLocalInputValue('2026-09-29T15:00:00Z'),'2026-09-30T00:00')
 assert.equal(new Date(normalizeBusinessDateTime('2026-09-30T00:00')).toISOString(),'2026-09-29T15:00:00.000Z')
 assert.equal(formatDisplayDate('2026-09-30'),'2026-09-30')
})
