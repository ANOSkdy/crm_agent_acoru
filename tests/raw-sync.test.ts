import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp,mkdir,writeFile,readFile,rename,symlink,rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { testDatabase,adapter } from './helpers/database'
import { RawCredentials } from '../lib/raw/credentials'
import { RawRepository } from '../lib/raw/repository'
import { contentHash } from '../lib/raw/domain'
import { scanRoot,planSync,readSyncState,sendPlan,acknowledge,type LocalFile,type SyncState } from '../lib/raw/local-sync'
test('scoped credentials: only hashes stored, revoked/expired/viewer/inactive rejected',async()=>{
 const db=await testDatabase();try{
  const actor=randomUUID();await db.query("INSERT INTO users(id,name,email,role) VALUES($1,'A','sync@test.invalid','admin')",[actor])
  const repo=new RawCredentials(adapter(db)),issued=await repo.issue(actor,'PC');assert.equal(await repo.authenticate('Bearer '+issued.token),actor)
  const stored=await db.query<{secret_hash:string}>('SELECT secret_hash FROM raw_ingest_credentials');assert.equal(stored.rows[0].secret_hash,contentHash(issued.token));assert.notEqual(stored.rows[0].secret_hash,issued.token)
  assert.equal(JSON.stringify(await repo.list(actor)).includes(issued.token),false)
  await repo.revoke(actor,issued.id as string);await assert.rejects(repo.authenticate('Bearer '+issued.token),{status:401})
  const next=await repo.issue(actor,'PC2');await db.query("UPDATE raw_ingest_credentials SET expires_at=now()-interval '1 second',created_at=now()-interval '1 day' WHERE id=$1",[next.id])
  await assert.rejects(repo.authenticate('Bearer '+next.token),{status:401})
  await db.query("UPDATE users SET role='viewer' WHERE id=$1",[actor]);await assert.rejects(repo.authenticate('Bearer '+next.token));await assert.rejects(repo.issue(actor,'bad'))
 }finally{await db.close()}
})
test('T17-20: local retry, unchanged, rename, deleted originals and safe scan',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'crm-raw-sync-')),db=await testDatabase()
 try{
  await mkdir(path.join(root,'daily'));await mkdir(path.join(root,'.secrets'));await mkdir(path.join(root,'node_modules'))
  await writeFile(path.join(root,'daily','note.md'),'# business\nhello');await writeFile(path.join(root,'.env.txt'),'SECRET')
  await writeFile(path.join(root,'.secrets','x.md'),'SECRET');await writeFile(path.join(root,'node_modules','x.md'),'not business')
  await writeFile(path.join(root,'bad.txt'),Buffer.from([0xff,0x00]));await writeFile(path.join(root,'image.bin'),'binary')
  try{await symlink(os.tmpdir(),path.join(root,'outside'),'junction')}catch{/* Windows may disallow junctions for an unprivileged process. */}
  let scan=await scanRoot(root);assert.equal(scan.files.length,1);assert.deepEqual(scan.rejected,['bad.txt'])
  const actor=randomUUID();await db.query("INSERT INTO users(id,name,email,role) VALUES($1,'A','syncretry@test.invalid','admin')",[actor])
  const repo=new RawRepository(adapter(db)),token='raw_'+'a'.repeat(64);let loseAck=true,calls=0
  const transport:typeof fetch=async(_url,init)=>{
   calls++;assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer '+token)
   const input=JSON.parse(init?.body as string);const results=[]
   for(const [index,d] of input.documents.entries())results.push({index,...await repo.ingest(actor,d)})
   if(loseAck)throw new Error('private details '+token)
   return Response.json({results})
  }
  let plan=planSync(scan.files,await readSyncState(root))
  await assert.rejects(sendPlan(plan,root,'https://crm.example.test',token,transport),/SYNC_NETWORK/)
  let state=await readSyncState(root);assert.equal(state.entries[0].ack_hash,null);const id=state.entries[0].local_id
  loseAck=false;plan=planSync(scan.files,state);await sendPlan(plan,root,'https://crm.example.test',token,transport)
  state=await readSyncState(root);assert.equal(state.entries[0].local_id,id);assert.ok(state.entries[0].ack_hash)
  assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM raw_document_revisions')).rows[0].n,1)
  plan=planSync(scan.files,state);assert.equal(plan.send.length,0);const before=calls;await sendPlan(plan,root,'https://crm.example.test',token,transport);assert.equal(calls,before)
  await rename(path.join(root,'daily','note.md'),path.join(root,'moved.md'));scan=await scanRoot(root)
  plan=planSync(scan.files,state);assert.equal(plan.send[0].entry.local_id,id);await sendPlan(plan,root,'https://crm.example.test',token,transport)
  state=await readSyncState(root);assert.equal(state.entries[0].ack_path,'moved.md')
  await rm(path.join(root,'moved.md'));scan=await scanRoot(root);plan=planSync(scan.files,state);assert.equal(plan.send.length,0);assert.deepEqual(plan.missing,['moved.md'])
  assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM raw_documents')).rows[0].n,1)
  assert.equal((await readFile(path.join(root,'.acoru-raw-sync.json'),'utf8')).includes(token),false)
 }finally{await db.close();await rm(root,{recursive:true,force:true})}
})
test('uncertain identity requires explicit resolution; bad ack cannot mark success',()=>{
 const hash=contentHash('same'),file:LocalFile={relative_path:'new.md',dev:1,ino:999,content:'same',hash}
 const state:SyncState={version:1,entries:['old.md','older.md'].map((p,i)=>({local_id:randomUUID(),relative_path:p,dev:1,ino:i+1,ack_hash:hash,server_document_id:randomUUID(),server_revision_id:randomUUID(),ack_path:p}))}
 const plan=planSync([file],state);assert.deepEqual(plan.conflicts,['new.md']);assert.equal(plan.send.length,0)
 assert.throws(()=>acknowledge(state.entries[0],file,{status:'unchanged',document_id:randomUUID(),revision_id:randomUUID(),content_hash:hash}),/SYNC_ACK/)
 assert.equal(state.entries[0].ack_path,'old.md')
})
