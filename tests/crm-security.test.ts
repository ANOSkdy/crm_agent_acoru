import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { assertCrmUser, checkCrmRelations } from '../lib/auth/crm-policy'
import { testDatabase, adapter } from './helpers/database'
import { GET as companiesExport } from '../app/api/export/companies/route'
import { GET as dealsExport } from '../app/api/export/deals/route'
import * as companies from '../lib/actions/companies'
import * as contacts from '../lib/actions/contacts'
import { updateCompanyGridCellAction, updateContactGridCellAction } from '../lib/actions/grid-updates'
test('T01/T02: unauthenticated exports and direct actions fail closed', async () => {
 const prior=process.env.MFA_ENCRYPTION_KEY; delete process.env.MFA_ENCRYPTION_KEY
 try {
  for(const get of [companiesExport,dealsExport]) { const res=await get();assert.equal(res.status,401);assert.deepEqual(Object.keys(await res.json()),['error']) }
  for(const create of [companies.createCompanyAction,contacts.createContactAction]) await assert.rejects(create(new FormData()),{status:401})
  for(const update of [companies.updateCompanyAction,contacts.updateContactAction]) await assert.rejects(update(randomUUID(),new FormData()),{status:401})
  for(const remove of [companies.deleteCompanyAction,contacts.deleteContactAction]) await assert.rejects(remove(randomUUID()),{status:401})
  assert.equal((await updateCompanyGridCellAction(randomUUID(),'name','private')).ok,false)
  assert.equal((await updateContactGridCellAction(randomUUID(),'name','private')).ok,false)
 } finally {if(prior===undefined)delete process.env.MFA_ENCRYPTION_KEY;else process.env.MFA_ENCRYPTION_KEY=prior}
})
test('T03: reject cross-company, missing, viewer and foreign owner relations', async () => {
 const db=await testDatabase()
 try {
 const uid=randomUUID(),company=randomUUID(),other=randomUUID(),deal=randomUUID(),contact=randomUUID()
 await db.query("INSERT INTO users(id,name,email,role) VALUES ($1,'actor','actor@test.invalid','member')",[uid])
 await db.query("INSERT INTO companies(id,name) VALUES ($1,'one'),($2,'two')",[company,other])
 await db.query("INSERT INTO deals(id,company_id,title,owner_user_id) VALUES ($1,$2,'deal',$3)",[deal,company,uid])
 await db.query("INSERT INTO contacts(id,company_id,name) VALUES ($1,$2,'contact')",[contact,other])
 const user={id:uid,name:'actor',email:'actor@test.invalid',role:'member',is_active:true}
 await checkCrmRelations(adapter(db),user,{company_id:company,deal_id:deal})
 await assert.rejects(checkCrmRelations(adapter(db),user,{company_id:other,deal_id:deal}),{status:400})
 await assert.rejects(checkCrmRelations(adapter(db),user,{company_id:company,contact_id:contact}),{status:400})
 await assert.rejects(checkCrmRelations(adapter(db),user,{company_id:randomUUID()}),{status:404})
 assert.throws(()=>assertCrmUser({...user,role:'viewer'},true),{status:403})
 await assert.rejects(checkCrmRelations(adapter(db),{...user,id:randomUUID()},{deal_id:deal}),{status:403})
 } finally { await db.close() }
})
