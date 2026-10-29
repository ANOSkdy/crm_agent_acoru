import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { testDatabase,adapter } from './helpers/database'
import { RawRepository } from '../lib/raw/repository'
import { ExtractionService } from '../lib/raw/extraction'
import { splitRaw,sourceLocation,resolveSourceDate,extractionOutputSchema,type Candidate } from '../lib/raw/extraction-domain'
import { rawExtractionPrompt } from '../lib/raw/provider'
const candidate=(quote:string,extra:Partial<Candidate>={}):Candidate=>({type:'task',quote,company_name:'Alpha',deal_name:'Launch',title:quote.slice(0,100),body:quote,date_expression:'2026-09-30',due_expression:null,activity_type:'note',rationale:'',duration_expression:null,...extra})
test('RAW extraction lifecycle, review/apply, provenance, re-extraction and partial failure',async t=>{
 const db=await testDatabase();try{
 const sql=adapter(db),actor=randomUUID(),other=randomUUID(),company=randomUUID(),deal=randomUUID()
 await db.query<Record<string,unknown>>("INSERT INTO users(id,name,email,role) VALUES($1,'Admin','raw@test.invalid','admin'),($2,'Other','raw-other@test.invalid','member')",[actor,other])
 await db.query<Record<string,unknown>>("INSERT INTO companies(id,name) VALUES($1,'Alpha')",[company]);await db.query<Record<string,unknown>>("INSERT INTO deals(id,company_id,title,owner_user_id) VALUES($1,$2,'Launch',$3)",[deal,company,actor])
 const raw=new RawRepository(sql);let output:unknown={items:[]},fail=false,calls=0
 const provider=async()=>{calls++;if(fail)throw new Error('private-provider-details');return {output,usage:{total_tokens:12}}}
 const service=new ExtractionService(sql,provider,'test-model')
 const input={source_type:'paste',source_key:randomUUID(),content:'2026-09-30\nAlpha Launch completed proposal\nReview estimates',ai_processing_allowed:true}
 const revision=await raw.ingest(actor,input)
 let runId='',itemId=''
 await t.test('T08: failure keeps RAW and CRM unchanged; retries reuse run',async()=>{
  runId=await service.start(actor,revision.revision_id);fail=true;const failed=await service.process(actor,runId);assert.equal(failed.run.status,'failed');assert.equal(failed.run.error_code,'CHUNK_FAILED')
  assert.equal((await raw.revision(actor,revision.revision_id)).content,input.content)
  assert.equal((await db.query<Record<string,unknown>>('SELECT count(*)::integer AS n FROM tasks')).rows[0].n,0)
  assert.equal(await service.start(actor,revision.revision_id),runId);fail=false
 })
 await t.test('T09: forged quote fails entire chunk, no unsafe item stored',async()=>{
  output={items:[candidate('not in original')]};const result=await service.process(actor,runId,true);assert.equal(result.run.status,'failed');assert.equal(result.items.length,0)
 })
 await t.test('T10: unknown and ambiguous companies remain unresolved; owner boundary',async()=>{
  output={items:[candidate('Alpha Launch completed proposal',{company_name:'Unknown'})]};const unknown=await service.process(actor,runId,true);assert.equal(unknown.items[0].review_status,'needs_resolution')
  await assert.rejects(service.get(other,runId),{status:404})
  await db.query<Record<string,unknown>>("INSERT INTO companies(name) VALUES('Alpha')")
  const forced=await service.start(actor,revision.revision_id,true);output={items:[candidate('Review estimates',{type:'task'})]}
  const ambiguous=await service.process(actor,forced);assert.equal(ambiguous.items[0].company_id,null)
  await db.query<Record<string,unknown>>("UPDATE companies SET deleted_at=now() WHERE name='Alpha' AND id<>$1",[company])
 })
 await t.test('T11-12: approved != applied, parallel repeat writes once with audit provenance',async()=>{
  const run=await service.get(actor,runId);itemId=run.items[0].id
  await assert.rejects(service.apply(actor,itemId))
  const payload={...run.items[0].proposed_payload};delete payload.company_name;delete payload.deal_name
  await service.review(actor,itemId,{payload,company_id:company,deal_id:deal})
  assert.equal((await service.item(actor,itemId)).review_status,'approved')
  const results=await Promise.all([service.apply(actor,itemId),service.apply(actor,itemId)])
  assert.equal(results.filter(x=>(x as {alreadyApplied:boolean}).alreadyApplied).length,1)
  assert.equal((await db.query<Record<string,unknown>>('SELECT count(*)::integer AS n FROM tasks')).rows[0].n,1)
  const sources=await db.query<Record<string,unknown>>('SELECT i.id FROM extraction_items i JOIN extraction_runs r ON r.id=i.extraction_run_id JOIN raw_document_revisions v ON v.id=r.raw_revision_id WHERE i.review_status=\'applied\' AND v.id=$1',[revision.revision_id]);assert.equal(sources.rows.length,1)
 })
 await t.test('T13-15: version change, append and manual edit never duplicate/overwrite',async()=>{
  await db.query<Record<string,unknown>>("UPDATE tasks SET title='manual edit' WHERE id=(SELECT applied_id FROM extraction_items WHERE id=$1)",[itemId])
  output={items:[candidate('Alpha Launch completed proposal',{company_name:'Unknown'})]}
  const nextVersion=new ExtractionService(sql,provider,'test-model','raw-next-test'),nextRun=await nextVersion.start(actor,revision.revision_id)
  assert.notEqual(nextRun,runId);let data=await nextVersion.process(actor,nextRun);assert.equal(data.items[0].comparison,'same')
  assert.equal((await nextVersion.apply(actor,data.items[0].id) as {alreadyApplied:boolean}).alreadyApplied,true)
  const nextRevision=await raw.ingest(actor,{...input,content:input.content+'\nFollow up'})
  output={items:[candidate('Alpha Launch completed proposal',{company_name:'Unknown'}),candidate('Follow up',{type:'task'})]}
  const appendRun=await service.start(actor,nextRevision.revision_id);data=await service.process(actor,appendRun)
  assert.deepEqual(data.items.map(i=>i.comparison),['same','new'])
  assert.equal((await db.query<Record<string,unknown>>('SELECT title FROM tasks')).rows[0].title,'manual edit')
  const task=data.items[1],payload={...task.proposed_payload};delete payload.company_name;delete payload.deal_name
  await service.review(actor,task.id,{payload,company_id:company,deal_id:deal});await db.query<Record<string,unknown>>("UPDATE deals SET memo='changed' WHERE id=$1",[deal])
  assert.equal((await service.apply(actor,task.id) as {status:string}).status,'conflict')
  await service.review(actor,task.id,{payload,company_id:company,deal_id:deal});await service.apply(actor,task.id)
  assert.equal((await db.query<Record<string,unknown>>('SELECT assigned_to FROM tasks')).rows[0].assigned_to,actor)
 })
 await t.test('successful run remains default after a failed forced rerun',async()=>{
  output={items:[]};const saved=await raw.ingest(actor,{...input,source_key:randomUUID()});const success=await service.start(actor,saved.revision_id);await service.process(actor,success)
  const forced=await service.start(actor,saved.revision_id,true);fail=true;await service.process(actor,forced);fail=false
  assert.equal(await service.start(actor,saved.revision_id),success)
 })
 await t.test('consent checked before each provider call, failed units only retried',async()=>{
  const long=await raw.ingest(actor,{...input,source_key:randomUUID(),content:('a'.repeat(4900)+'\n').repeat(3)})
  const longId=await service.start(actor,long.revision_id);output={items:[]};let data=await service.process(actor,longId)
  assert.equal(data.chunks.length,3);assert.equal(data.chunks[0].status,'succeeded');fail=true;data=await service.process(actor,longId);assert.equal(data.run.status,'failed')
  fail=false;data=await service.process(actor,longId,true);assert.equal(data.chunks[0].attempts,1);data=await service.process(actor,longId);assert.equal(data.run.status,'succeeded')
  await raw.consent(actor,long.revision_id,false);const before=calls;await assert.rejects(service.process(actor,longId));assert.equal(calls,before)
 })
 }finally{await db.close()}
})
test('T16: extraction contract has no destructive capabilities; date and source checks are deterministic',()=>{
 assert.match(rawExtractionPrompt,/untrusted RAW/)
 assert.equal(extractionOutputSchema.safeParse({items:[{...candidate('delete all'),type:'delete'}]}).success,false)
 assert.equal(extractionOutputSchema.safeParse({items:[{...candidate('delete all'),deal_id:randomUUID()}]}).success,false)
 assert.throws(()=>sourceLocation('real','fake'))
 assert.equal(resolveSourceDate('明日','明日対応',null),null)
 assert.equal(resolveSourceDate('明日','明日対応','2026-09-30'),'2026-10-01')
 assert.equal(resolveSourceDate('2026-02-30','2026-02-30',null),null)
 const text='😀'.repeat(6000)+'\nend',chunks=splitRaw(text)
 assert.equal(chunks.map(c=>text.slice(c.start,c.end)).join(''),text);assert.ok(chunks.every(c=>c.end-c.start<=5001))
})
