import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
config({path:'.env.local',quiet:true})
async function main() {
  const fixture=JSON.parse(readFileSync('.local-test/fixture.json','utf8'))
  const {searchCrm,getCrmRecord,getCrmMetrics,getPriorityItems}=await import('../lib/db/queries/crm-search')
  const {searchSchema,metricsSchema,prioritySchema}=await import('../lib/assistant/schema')
  const found=await searchCrm(searchSchema.parse({query:'検証用',entity:'company'}))
  assert.ok(found.records.some(record=>record.id===fixture.companyId))
  assert.ok(found.records.some(record=>record.id===fixture.otherCompanyId))
  const byOwner=await searchCrm(searchSchema.parse({query:'検証担当',entity:'deal',company_id:fixture.companyId}))
  assert.equal(byOwner.total,1,'Projected owner names are searchable')
  const detail=await getCrmRecord({entity:'deal',id:fixture.dealId})
  assert.equal(Number(detail?.data.amount),500000)
  const metrics=await getCrmMetrics(metricsSchema.parse({company_id:fixture.companyId}))
  assert.equal((metrics.deals as {open:number}).open,1)
  assert.equal((metrics.deals as {open_amount_yen:number}).open_amount_yen,500000)
  assert.equal((metrics.deals as {weighted_open_amount_yen:number}).weighted_open_amount_yen,200000)
  const overdue=await getPriorityItems(prioritySchema.parse({category:'overdue_tasks',company_id:fixture.companyId}))
  assert.equal(overdue.total,1)
  assert.equal(overdue.records[0].deal_id,fixture.dealId)
  const noMatch=await searchCrm(searchSchema.parse({query:'%_nonexistent_unique',company_id:fixture.companyId}))
  assert.equal(noMatch.total,0)
  console.log('PASS: cross-company search, detailed amounts, exact scoped aggregates, overdue-date filter, escaped literal search')
}
main().catch(error=>{console.error('Assistant data verification failed',error instanceof Error?error.message:'unknown');process.exitCode=1})
