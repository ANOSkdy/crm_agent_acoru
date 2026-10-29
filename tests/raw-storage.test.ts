import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { testDatabase,adapter } from './helpers/database'
import { RawRepository } from '../lib/raw/repository'
import { validateRaw,decodeRaw,contentHash,RAW_MAX_BYTES } from '../lib/raw/domain'
test('T04-06: immutable revisions, dedupe and independent document identity',async()=>{
 const db=await testDatabase();try{
  const actor=randomUUID(),other=randomUUID();await db.query("INSERT INTO users(id,name,email,role) VALUES($1,'a','a@test.invalid','admin'),($2,'b','b@test.invalid','admin')",[actor,other])
  const repo=new RawRepository(adapter(db));const input={source_type:'paste',source_key:randomUUID(),content:'# original\r\ntext',observed_at:'2026-09-30'}
  const first=await repo.ingest(actor,input),repeat=await repo.ingest(actor,input);assert.equal(first.revision_id,repeat.revision_id)
  const changed=await repo.ingest(actor,{...input,content:input.content+'\nnew'});assert.notEqual(first.revision_id,changed.revision_id)
  assert.equal((await repo.revision(actor,first.revision_id)).content,input.content)
  assert.equal((await repo.revision(actor,first.revision_id)).observed_at,'2026-09-30')
  assert.equal((await repo.document(actor,first.document_id)).revisions.length,2)
  await assert.rejects(db.query("UPDATE raw_document_revisions SET content='overwrite' WHERE id=$1",[first.revision_id]),/RAW_IMMUTABLE/)
  await assert.rejects(repo.revision(other,first.revision_id),{status:404})
  assert.notEqual((await repo.ingest(actor,{...input,source_key:randomUUID()})).document_id,first.document_id)
  await repo.consent(actor,first.revision_id,true);assert.equal((await repo.revision(actor,first.revision_id)).ai_processing_allowed,true)
  assert.equal('content' in (await repo.list(actor)).documents[0],false)
 }finally{await db.close()}
})
test('T07: strict UTF8/binary/extension/size/hash/path boundaries, preserve original text',()=>{
 assert.throws(()=>decodeRaw(new Uint8Array([0xff,0xfe]),'a.txt'))
 assert.throws(()=>decodeRaw(new Uint8Array([0,1]),'a.md'))
 assert.throws(()=>decodeRaw(new Uint8Array(RAW_MAX_BYTES+1),'a.md'))
 assert.throws(()=>decodeRaw(new TextEncoder().encode('abc'),'a.pdf'))
 assert.throws(()=>validateRaw({source_type:'paste',source_key:'one',content:'a',content_hash:contentHash('b')}))
 assert.throws(()=>validateRaw({source_type:'local_sync',source_key:randomUUID(),relative_path:'../secret.md',original_filename:'secret.md',content:'a'}))
 assert.equal(decodeRaw(new TextEncoder().encode('\uFEFF# test\r\n  x\n'),'a.md'),'\uFEFF# test\r\n  x\n')
})
