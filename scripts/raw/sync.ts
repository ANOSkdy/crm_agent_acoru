import { scanRoot,readSyncState,planSync,sendPlan,lockSync,saveSyncState } from '../../lib/raw/local-sync'
async function main(){
 const args=process.argv.slice(2)
 let root:string|undefined,url=process.env.RAW_SYNC_URL,dry=false,newPath:string|undefined,move:string|undefined
 for(let i=0;i<args.length;i++){const arg=args[i];if(arg==='--root')root=args[++i];else if(arg==='--url')url=args[++i];else if(arg==='--dry-run')dry=true;else if(arg==='--new')newPath=args[++i];else if(arg==='--move')move=args[++i];else throw new Error('ARGS')}
 if(!root)throw new Error('ROOT')
 const scan=await scanRoot(root),unlock=dry?async()=>{}:await lockSync(scan.base)
 try{
  const state=await readSyncState(scan.base)
  // Explicit user identity decisions for ambiguous moves/new files. Dry run never writes state.
  if(move){const [from,to,...extra]=move.split('=');const entry=state.entries.find(e=>e.relative_path===from);if(!entry||!to||extra.length||state.entries.some(e=>e.relative_path===to)||!scan.files.some(f=>f.relative_path===to)||scan.files.some(f=>f.relative_path===from))throw new Error('MOVE');entry.relative_path=to}
  if(newPath){const file=scan.files.find(f=>f.relative_path===newPath);if(!file||state.entries.some(e=>e.relative_path===newPath))throw new Error('NEW');state.entries.push({local_id:crypto.randomUUID(),relative_path:newPath,dev:file.dev,ino:file.ino,ack_hash:null,ack_path:null,server_document_id:null,server_revision_id:null})}
  const plan=planSync(scan.files,state)
  for(const file of scan.rejected)console.log('rejected:',file)
  for(const file of plan.conflicts)console.log('identity_review:',file)
  for(const file of plan.missing)console.log('local_missing_server_preserved:',file)
  for(const {file} of plan.send)console.log(dry?'would_send:':'sending:',file.relative_path)
  console.log('unchanged:',plan.unchanged.length)
  if(dry)return
  if(!url||!process.env.RAW_SYNC_TOKEN)throw new Error('CONFIG')
  const result=await sendPlan(plan,scan.base,url,process.env.RAW_SYNC_TOKEN)
  for(const row of result)console.log(row.status+':',row.path)
  if(!plan.send.length && (move||newPath))await saveSyncState(scan.base,plan.state)
  if(scan.rejected.length||plan.conflicts.length||result.some(r=>['rejected','conflict'].includes(r.status)))process.exitCode=1
 }finally{await unlock()}
}
main().catch(()=>{console.error('同期を完了できません。--root / --url、RAW_SYNC_TOKEN、接続、stateの整合性を確認してください。ackのない文書は次回再試行します。');process.exitCode=1})
