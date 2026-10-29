import { rawBatches } from './batch'
import { lstat,readdir,readFile,realpath,writeFile,rename,open,unlink } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { decodeRaw,contentHash,RAW_MAX_BYTES,type IngestResult } from './domain'
const STATE='.acoru-raw-sync.json'
const entrySchema=z.object({local_id:z.uuid(),relative_path:z.string(),dev:z.number(),ino:z.number(),ack_hash:z.string().nullable(),server_document_id:z.uuid().nullable(),server_revision_id:z.uuid().nullable(),ack_path:z.string().nullable()}).strict()
const stateSchema=z.object({version:z.literal(1),entries:z.array(entrySchema)}).strict()
export type SyncEntry=z.infer<typeof entrySchema>
export type SyncState=z.infer<typeof stateSchema>
export type LocalFile={relative_path:string;dev:number;ino:number;content:string;hash:string}
export type SyncPlan={state:SyncState;send:{entry:SyncEntry;file:LocalFile}[];unchanged:string[];conflicts:string[];missing:string[]}
export async function scanRoot(root:string){
 const base=await realpath(root),files:LocalFile[]=[],rejected:string[]=[]
 if(!(await lstat(base)).isDirectory())throw new Error('SYNC_ROOT')
 async function walk(directory:string){for(const entry of await readdir(directory,{withFileTypes:true})){
  if(entry.name.startsWith('.')||entry.name==='node_modules')continue
  const absolute=path.join(directory,entry.name),relative=path.relative(base,absolute)
  const stat=await lstat(absolute);if(stat.isSymbolicLink())continue
  if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('SYNC_BOUNDARY')
  if(stat.isDirectory()){await walk(absolute);continue}
  if(!stat.isFile()||!/\.(md|txt)$/i.test(entry.name))continue
  if(stat.size>RAW_MAX_BYTES){rejected.push(relative);continue}
  // Recheck canonical containment before reading: never follow links beyond the allowlisted root.
  const resolved=await realpath(absolute),rel=path.relative(base,resolved)
  if(rel.startsWith('..')||path.isAbsolute(rel)){rejected.push(relative);continue}
  try{const content=decodeRaw(await readFile(absolute),entry.name);files.push({relative_path:relative.split(path.sep).join('/'),dev:stat.dev,ino:Number.isSafeInteger(stat.ino)?stat.ino:0,content,hash:contentHash(content)})}catch{rejected.push(relative)}
 }}
 await walk(base)
 return {base,files,rejected}
}
export function planSync(files:LocalFile[],state:SyncState):SyncPlan{
 const next:SyncState=structuredClone(state),send:SyncPlan['send']=[],unchanged:string[]=[],conflicts:string[]=[]
 const currentPaths=new Set(files.map(f=>f.relative_path)),claimed=new Set<string>()
 const missing=next.entries.filter(e=>!currentPaths.has(e.relative_path))
 for(const file of files){
  let entry=next.entries.find(e=>e.relative_path===file.relative_path)
  if(!entry){
   const physical=missing.filter(e=>e.ino!==0&&e.ino===file.ino&&e.dev===file.dev&&!claimed.has(e.local_id))
   const hashMatches=missing.filter(e=>e.ack_hash===file.hash&&!claimed.has(e.local_id))
   const matches=physical.length?physical:hashMatches
   if(matches.length===1){entry=matches[0];claimed.add(entry.local_id);entry.relative_path=file.relative_path}
   else if(matches.length>1){conflicts.push(file.relative_path);continue}
   else if(missing.some(e=>!claimed.has(e.local_id))){conflicts.push(file.relative_path);continue}
   else {entry={local_id:randomUUID(),relative_path:file.relative_path,dev:file.dev,ino:file.ino,ack_hash:null,ack_path:null,server_document_id:null,server_revision_id:null};next.entries.push(entry)}
  }
  entry.dev=file.dev;entry.ino=file.ino
  if(entry.ack_hash===file.hash&&entry.ack_path===file.relative_path)unchanged.push(file.relative_path)
  else send.push({entry,file})
 }
 return {state:next,send,unchanged,conflicts,missing:next.entries.filter(e=>!currentPaths.has(e.relative_path)).map(e=>e.relative_path)}
}
export function acknowledge(entry:SyncEntry,file:LocalFile,result:IngestResult){
 if(result.content_hash!==file.hash||!z.uuid().safeParse(result.document_id).success||!z.uuid().safeParse(result.revision_id).success|| (entry.server_document_id&&entry.server_document_id!==result.document_id))throw new Error('SYNC_ACK')
 entry.ack_hash=file.hash;entry.ack_path=file.relative_path;entry.server_document_id=result.document_id;entry.server_revision_id=result.revision_id
}
export async function readSyncState(root:string):Promise<SyncState>{
 try{const file=path.join(root,STATE);if((await lstat(file)).isSymbolicLink())throw new Error('SYNC_STATE_LINK');const state=stateSchema.parse(JSON.parse(await readFile(file,'utf8')));if(new Set(state.entries.map(e=>e.local_id)).size!==state.entries.length||new Set(state.entries.map(e=>e.relative_path)).size!==state.entries.length)throw new Error('SYNC_STATE');return state}
 catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {version:1,entries:[]};throw new Error('SYNC_STATE')}
}
export async function saveSyncState(root:string,state:SyncState){
 const temporary=path.join(root,STATE+'.'+randomUUID()+'.tmp')
 await writeFile(temporary,JSON.stringify(state,null,2),{flag:'wx',mode:0o600});await rename(temporary,path.join(root,STATE))
}
export async function lockSync(root:string){
 const file=path.join(root,STATE+'.lock');const handle=await open(file,'wx',0o600)
 return async()=>{await handle.close();await unlink(file)}
}
export async function sendPlan(plan:SyncPlan,root:string,origin:string,token:string,transport:typeof fetch=fetch){
 const url=new URL(origin)
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/' || (url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw new Error('SYNC_URL')
 if(!/^raw_[a-f0-9]{64}$/.test(token))throw new Error('SYNC_TOKEN')
 // Persist identity before the first request; acknowledgements are only written after validated responses.
 await saveSyncState(root,plan.state)
 const outcomes:{path:string;status:string}[]=[]
 const encode=({entry,file}:SyncPlan['send'][number])=>({source_type:'local_sync',source_key:entry.local_id,relative_path:file.relative_path,original_filename:file.relative_path.split('/').at(-1),document_id:entry.server_document_id,content:file.content,content_hash:file.hash})
 for(const batch of rawBatches(plan.send,encode)){
  let response:Response
  try{response=await transport(new URL('/api/raw/sync',url),{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({documents:batch.map(encode)})})}catch{throw new Error('SYNC_NETWORK')}
  if(!response.ok)throw new Error('SYNC_RESPONSE')
  const result=z.object({results:z.array(z.object({index:z.number().int().min(0),status:z.enum(['unchanged','created_document','created_revision','rejected','conflict']),document_id:z.uuid().optional(),revision_id:z.uuid().optional(),content_hash:z.string().optional()}).passthrough())}).parse(await response.json())
  if(result.results.length!==batch.length||new Set(result.results.map(r=>r.index)).size!==batch.length)throw new Error('SYNC_ACK')
  for(const row of result.results){const pair=batch[row.index];if(!pair)throw new Error('SYNC_ACK');if(['created_document','created_revision','unchanged'].includes(row.status))acknowledge(pair.entry,pair.file,row as IngestResult);outcomes.push({path:pair.file.relative_path,status:row.status})}
  await saveSyncState(root,plan.state)
 }
 return outcomes
}
