import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { testDatabase,adapter } from './helpers/database'
import { RawRepository } from '../lib/raw/repository'
import { ExtractionService } from '../lib/raw/extraction'
import { explicitDuration,MAX_WORK_MINUTES } from '../lib/raw/duration'
import { getWorkReport,workFiltersSchema } from '../lib/raw/work-report'
import type { Candidate } from '../lib/raw/extraction-domain'
const work=(quote:string,expression:string):Candidate=>({type:'work_log',quote,title:quote,body:'',date_expression:'2026-09-30',due_expression:null,company_name:null,deal_name:null,activity_type:'note',rationale:'',duration_expression:expression})
test('T21-22 explicit duration only, positive capped minutes and no scheduled-time inference',()=>{
 for(const expression of ['1.5h','1時間30分','90分','1.5時間'])assert.equal(explicitDuration('資料 '+expression,expression),90)
 assert.equal(explicitDuration('調整 30m','30m'),30)
 for(const [quote,expression] of [['10:00-11:00 会議予定','60分'],['会議予定 1h','1h'],['実績 0h','0h'],['実績 25h','25h'],['実績 0.001h','0.001h'],['作業','1h']])assert.equal(explicitDuration(quote,expression),null)
 assert.equal(MAX_WORK_MINUTES,1440)
})
test('work log apply/dedupe/aggregation and multi-deal single-operation proposals',async()=>{
 const db=await testDatabase();try{
 const sql=adapter(db),actor=randomUUID(),company=randomUUID(),deal=randomUUID(),deal2=randomUUID()
 await db.query("INSERT INTO users(id,name,email,role) VALUES($1,'A','hours@test.invalid','admin')",[actor])
 await db.query("INSERT INTO companies(id,name) VALUES($1,'Alpha')",[company]);await db.query("INSERT INTO deals(id,company_id,title) VALUES($1,$3,'One'),($2,$3,'Two')",[deal,deal2,company])
 const raw=new RawRepository(sql);let items:Candidate[]=[work('資料作成 1.5h','1.5h')]
 const service=new ExtractionService(sql,async()=>({output:{items}}),'test-model')
 const input={source_type:'paste',source_key:randomUUID(),content:'2026-09-30\n資料作成 1.5h',ai_processing_allowed:true}
 let saved=await raw.ingest(actor,input),runId=await service.start(actor,saved.revision_id),data=await service.process(actor,runId)
 let item=data.items[0];const payload={...item.proposed_payload};delete payload.company_name;delete payload.deal_name
 await service.review(actor,item.id,{payload,company_id:company,deal_id:deal})
 await Promise.all([service.apply(actor,item.id),service.apply(actor,item.id)])
 let report=await getWorkReport(sql,workFiltersSchema.parse({}));assert.equal(report.total_minutes,90);assert.equal(report.unallocated_minutes,0);assert.equal(report.records[0].worker_name,null)
 items=[work('資料作成 1.5h','1.5h'),work('調整 30m','30m')]
 saved=await raw.ingest(actor,{...input,content:input.content+'\n調整 30m'});runId=await service.start(actor,saved.revision_id);data=await service.process(actor,runId)
 assert.deepEqual(data.items.map(i=>i.comparison),['same','new']);item=data.items[1]
 const newPayload={...item.proposed_payload};delete newPayload.company_name;delete newPayload.deal_name
 await service.review(actor,item.id,{payload:newPayload,company_id:null,deal_id:null});await service.apply(actor,item.id)
 report=await getWorkReport(sql,workFiltersSchema.parse({}));assert.equal(report.total_minutes,120);assert.equal(report.unallocated_minutes,30);assert.equal(report.daily[0].minutes,120)
 await db.query("UPDATE work_logs SET status='cancelled' WHERE deal_id IS NULL");report=await getWorkReport(sql,workFiltersSchema.parse({}));assert.equal(report.total_minutes,90)
 await db.query("UPDATE companies SET deleted_at=now() WHERE id=$1",[company]);report=await getWorkReport(sql,workFiltersSchema.parse({}));assert.equal(report.total_minutes,0)
 await db.query("UPDATE companies SET deleted_at=NULL WHERE id=$1",[company])
 // A provider must not strip 'scheduled' from its quote to invent actual work.
 items=[work('1h','1h')]
 const scheduled=await raw.ingest(actor,{...input,source_key:randomUUID(),content:'2026-09-30\n会議予定 1h'})
 const scheduledRun=await service.start(actor,scheduled.revision_id)
 assert.equal((await service.process(actor,scheduledRun)).run.status,'failed')
 // Twelve records across two deals are reviewed and applied independently.
 items=Array.from({length:12},(_,i)=>({...work('task '+String(i).padStart(2,'0'),'1h'),type:'task' as const,company_name:'Alpha',deal_name:i%2?'One':'Two'}))
 const multi=await raw.ingest(actor,{...input,source_key:randomUUID(),content:items.map(i=>i.quote).join('\n')})
 runId=await service.start(actor,multi.revision_id);data=await service.process(actor,runId);assert.equal(data.items.length,12)
 for(const i of data.items){const p={...i.proposed_payload};delete p.company_name;delete p.deal_name;await service.review(actor,i.id,{payload:p,company_id:company,deal_id:i.deal_id});await service.apply(actor,i.id)}
 const proposals=await sql.query("SELECT id FROM extraction_items WHERE review_status='applied' AND applied_type='task'")
 assert.equal(proposals.length,12)
 // Decision adds history, without silently changing current strategy.
 items=[{...work('Use staged delivery','1h'),type:'decision',company_name:'Alpha',deal_name:'One',rationale:'reduce uncertainty'}]
 const decision=await raw.ingest(actor,{...input,source_key:randomUUID(),content:'2026-09-30\nUse staged delivery'})
 runId=await service.start(actor,decision.revision_id);data=await service.process(actor,runId);item=data.items[0]
 const decisionPayload={...item.proposed_payload};delete decisionPayload.company_name;delete decisionPayload.deal_name
 await service.review(actor,item.id,{payload:decisionPayload,company_id:company,deal_id:deal});await service.apply(actor,item.id)
 assert.equal((await sql.query('SELECT count(*)::int AS n FROM deal_decisions'))[0].n,1)
 assert.equal((await sql.query('SELECT count(*)::int AS n FROM deal_contexts'))[0].n,0)
 }finally{await db.close()}
})
