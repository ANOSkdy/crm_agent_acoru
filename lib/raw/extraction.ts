import { explicitDuration } from './duration'
import type { CrmDatabase } from '../auth/crm-policy'
import { AppError } from '../http/errors'
import { RawRepository } from './repository'
import { candidateIdentity,candidatePayload,extractionOutputSchema,splitRaw,sourceLocation,validateReviewed,EXTRACTION_VERSION,SCHEMA_VERSION,PROMPT_VERSION,type RawItem } from './extraction-domain'
export type ExtractionProvider=(content:string,context:{observed_at:string|null;model:string})=>Promise<{output:unknown;usage?:Record<string,number>}>
export class ExtractionService{
 readonly raw:RawRepository
 constructor(readonly db:CrmDatabase,readonly provider:ExtractionProvider,readonly model:string,readonly version=EXTRACTION_VERSION){this.raw=new RawRepository(db)}
 async start(actor:string,revisionId:string,force=false){
  const revision=await this.raw.revision(actor,revisionId)
  if(!revision.ai_processing_allowed)throw new AppError(403,'この版は外部AIへの送信が許可されていません')
  const [row]=await this.db.query('SELECT start_raw_extraction($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8::jsonb) AS id',[actor,revisionId,this.version,SCHEMA_VERSION,PROMPT_VERSION,this.model,force,JSON.stringify(splitRaw(revision.content))])
  return row.id as string
 }
 async get(actor:string,runId:string){
  const [run]=await this.db.query(`SELECT r.* FROM extraction_runs r JOIN raw_document_revisions v ON v.id=r.raw_revision_id JOIN raw_documents d ON d.id=v.document_id WHERE r.id=$1 AND d.created_by=$2 AND d.archived_at IS NULL`,[runId,actor])
  if(!run)throw new AppError(404,'抽出が見つかりません')
  const chunks=await this.db.query('SELECT id,ordinal,status,attempts,error_code FROM extraction_chunks WHERE extraction_run_id=$1 ORDER BY ordinal',[runId])
  const items=await this.db.query(`SELECT i.*,CASE WHEN d.id IS NOT NULL THEN jsonb_build_object('title',d.title,'agent_revision',d.agent_revision,'company_id',d.company_id,'status',d.status,'memo',d.memo,'context',(SELECT to_jsonb(ctx) FROM deal_contexts ctx WHERE ctx.deal_id=d.id)) END AS current_deal,
   CASE WHEN p.id IS NOT NULL THEN jsonb_build_object('id',p.id,'payload',COALESCE(p.reviewed_payload,p.proposed_payload),'status',p.review_status,'applied_type',p.applied_type,'applied_id',p.applied_id,'current_record',CASE p.applied_type WHEN 'task' THEN (SELECT to_jsonb(t) FROM tasks t WHERE t.id=p.applied_id) WHEN 'decision' THEN (SELECT to_jsonb(dd) FROM deal_decisions dd WHERE dd.id=p.applied_id) WHEN 'work_log' THEN (SELECT to_jsonb(w) FROM work_logs w WHERE w.id=p.applied_id) END) END AS previous_item
   FROM extraction_items i LEFT JOIN deals d ON d.id=i.deal_id AND d.deleted_at IS NULL LEFT JOIN extraction_items p ON p.id=i.previous_item_id WHERE i.extraction_run_id=$1 ORDER BY i.source_start_line,i.created_at,i.id`,[runId])
  return {run,chunks,items:items as RawItem[]}
 }
 async list(actor:string,revisionId:string){
  await this.raw.revision(actor,revisionId)
  return this.db.query(`SELECT r.*, (SELECT count(*)::integer FROM extraction_items i WHERE i.extraction_run_id=r.id AND i.review_status IN ('pending','needs_resolution','approved','conflict') AND i.comparison<>'same') AS pending_count FROM extraction_runs r WHERE raw_revision_id=$1 ORDER BY created_at DESC`,[revisionId])
 }
 async process(actor:string,runId:string,retry=false){
  const {run}=await this.get(actor,runId)
  // A run records the actual provider/model; a deployment must not silently switch it midway.
  if(run.model!==this.model || run.extraction_version!==this.version || run.schema_version!==SCHEMA_VERSION || run.prompt_version!==PROMPT_VERSION)throw new AppError(409,'抽出設定が変わりました。新しい抽出を開始してください')
  const [{part}]=await this.db.query('SELECT claim_raw_chunk($1::uuid,$2::uuid,$3) AS part',[actor,runId,retry])
  if(!part)return this.get(actor,runId)
  const p=part as {id:string;start:number;end:number;attempt_id:string}
  try{
   const revision=await this.raw.revision(actor,run.raw_revision_id as string)
   if(!revision.ai_processing_allowed)throw new Error('CONSENT')
   const result=await this.provider(revision.content.slice(p.start,p.end),{observed_at:revision.observed_at,model:this.model})
   const output=extractionOutputSchema.parse(result.output)
   const previous=await this.db.query('SELECT * FROM extraction_items WHERE document_id=$1 AND extraction_run_id<>$2 ORDER BY applied_at DESC NULLS LAST,created_at DESC',[revision.document_id,runId]) as RawItem[]
   const companyNames=[...new Set(output.items.flatMap(c=>c.company_name?[c.company_name]:[]))]
   const catalogue=await this.db.query('SELECT id,name FROM companies WHERE name=ANY($1::text[]) AND deleted_at IS NULL',[companyNames])
   const dealNames=[...new Set(output.items.flatMap(c=>c.deal_name?[c.deal_name]:[]))]
   const dealCatalogue=await this.db.query('SELECT id,company_id,title,agent_revision,owner_user_id FROM deals WHERE company_id=ANY($1::uuid[]) AND title=ANY($2::text[]) AND deleted_at IS NULL',[catalogue.map(c=>c.id),dealNames])
   const items=[]
   for(const candidate of output.items){
    const location=sourceLocation(revision.content,candidate.quote,p.start,p.end)
    const payload=candidatePayload(candidate,revision.content,revision.observed_at)
    if(candidate.type==='work_log'){
     const at=revision.content.indexOf(candidate.quote,p.start),end=revision.content.indexOf('\n',at+candidate.quote.length)
     const context=revision.content.slice(revision.content.lastIndexOf('\n',at-1)+1,end<0?revision.content.length:end)
     if(!payload.duration_minutes||explicitDuration(context,candidate.duration_expression)!==payload.duration_minutes)throw new Error('DURATION_SOURCE')
    }
    const identity=candidateIdentity(revision.document_id,candidate,previous,location.repeated,payload)
    // Only exact names, across the full live catalogue. Access filtering must never turn an ambiguous name into a unique match.
    const companies=catalogue.filter(c=>c.name===candidate.company_name)
    const company=companies.length===1?companies[0].id as string:null
    const deals=dealCatalogue.filter(d=>d.company_id===company&&d.title===candidate.deal_name)
    const deal=deals.length===1?deals[0]:null
    const resolved=candidate.type==='work_log'?!!payload.date && !!payload.duration_minutes && !candidate.company_name && !candidate.deal_name:!!deal
    items.push({type:candidate.type,quote:candidate.quote,payload,...location,...identity,company_id:company,deal_id:deal?.id??null,base_revision:deal?.agent_revision??null,resolution:resolved?'resolved':'needs_resolution'})
   }
   const usage=Object.fromEntries(Object.entries(result.usage??{}).filter(([,v])=>Number.isSafeInteger(v)&&v>=0))
   await this.db.query('SELECT finish_raw_chunk($1::uuid,$2::uuid,$3::uuid,$4::jsonb,NULL,$5::jsonb)',[actor,p.id,p.attempt_id,JSON.stringify(items),JSON.stringify(usage)])
  }catch{
   // Do not store exception messages: providers/validation errors can contain raw customer text.
   await this.db.query("SELECT finish_raw_chunk($1::uuid,$2::uuid,$3::uuid,'[]'::jsonb,'EXTRACTION_FAILED','{}'::jsonb)",[actor,p.id,p.attempt_id])
  }
  return this.get(actor,runId)
 }
 async item(actor:string,id:string){
  const [item]=await this.db.query(`SELECT i.* FROM extraction_items i JOIN raw_documents d ON d.id=i.document_id WHERE i.id=$1 AND d.created_by=$2 AND d.archived_at IS NULL`,[id,actor])
  if(!item)throw new AppError(404,'候補が見つかりません')
  return item as RawItem
 }
 async review(actor:string,id:string,input:{payload?:unknown;company_id?:string|null;deal_id?:string|null;reject?:boolean;confirm_new?:boolean}){
  const item=await this.item(actor,id)
  const payload=input.reject?null:validateReviewed(item.item_type,input.payload)
  await this.db.query('SELECT review_raw_item($1::uuid,$2::uuid,$3::jsonb,$4::uuid,$5::uuid,$6,$7)',[actor,id,JSON.stringify(payload),input.company_id??null,input.deal_id??null,!!input.reject,!!input.confirm_new])
 }
 async apply(actor:string,id:string){
  const item=await this.item(actor,id)
  if(item.review_status!=='applied' && item.comparison!=='same')validateReviewed(item.item_type,item.reviewed_payload)
  const [{result}]=await this.db.query('SELECT apply_raw_item($1::uuid,$2::uuid) AS result',[actor,id])
  return result
 }
 async targets(actor:string,query:string){
  return this.db.query(`SELECT d.id,d.title,d.company_id,c.name AS company_name,d.agent_revision FROM deals d JOIN companies c ON c.id=d.company_id AND c.deleted_at IS NULL JOIN users u ON u.id=$1 AND u.is_active WHERE d.deleted_at IS NULL AND (u.role='admin' OR (u.role='member' AND d.owner_user_id=$1)) AND ($2='' OR d.title ILIKE '%'||$2||'%' OR c.name ILIKE '%'||$2||'%') ORDER BY c.name,d.title,d.id LIMIT 50`,[actor,query])
 }
}
