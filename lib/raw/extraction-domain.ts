import { explicitDuration,MAX_WORK_MINUTES } from './duration'
import { z } from 'zod'
import { dateOnly } from '../validation/date'
import { activityTypeSchema } from '../validation/activity-types'
import { contentHash } from './domain'
import { RAW_CHUNK_CHARS } from './constants'
export const EXTRACTION_VERSION='raw-2'
export const SCHEMA_VERSION='business-3'
export const PROMPT_VERSION='raw-review-3'
const nullableText=z.string().max(500).nullable()
export const candidateSchema=z.object({
 type:z.enum(['task','decision','work_log']), quote:z.string().min(1).max(5000),
 company_name:nullableText,deal_name:nullableText,
 title:z.string().min(1).max(200),body:z.string().max(4000),
 date_expression:nullableText,due_expression:nullableText,
 activity_type:activityTypeSchema,rationale:z.string().max(4000),duration_expression:nullableText.default(null),
}).strict()
export const extractionOutputSchema=z.object({items:z.array(candidateSchema).max(50)}).strict()
export type Candidate=z.infer<typeof candidateSchema>
export const reviewedPayloadSchema=z.object({
 title:z.string().trim().min(1).max(200),body:z.string().max(4000),date:dateOnly.nullable(),
 due_date:dateOnly.nullable(),activity_type:activityTypeSchema,rationale:z.string().max(4000),duration_minutes:z.number().int().min(1).max(MAX_WORK_MINUTES).nullable().default(null),worker_user_id:z.uuid().nullable().default(null),
}).strict()
export type ReviewedPayload=z.infer<typeof reviewedPayloadSchema>
export type RawItem={id:string;extraction_run_id:string;stable_item_key:string;item_type:Candidate['type']|'activity';proposed_payload:ReviewedPayload & {company_name?:string|null;deal_name?:string|null};reviewed_payload:ReviewedPayload|null;source_quote:string;source_start_line:number;source_end_line:number;comparison:string;previous_item_id:string|null;resolution_status:string;review_status:string;company_id:string|null;deal_id:string|null;base_revision:number|null;applied_type:string|null;applied_id:string|null;document_id:string;current_deal?:Record<string,unknown>|null;previous_item?:Record<string,unknown>|null}
export type Chunk={ordinal:number;start:number;end:number}
export function splitRaw(content:string):Chunk[]{
 const parts:Chunk[]=[];let start=0
 while(start<content.length){
  let end=Math.min(start+RAW_CHUNK_CHARS,content.length)
  if(end<content.length){const boundary=content.lastIndexOf('\n',end);if(boundary>start)end=boundary+1;else if(/[\uD800-\uDBFF]/.test(content[end-1]))end--}
  parts.push({ordinal:parts.length,start,end});start=end
 }
 return parts
}
const normalize=(value:string)=>value.normalize('NFKC').replace(/\s+/g,' ').trim()
export function sourceLocation(content:string,quote:string,start=0,end=content.length){
 const at=content.indexOf(quote,start)
 if(!quote || at<start || at+quote.length>end)throw new Error('SOURCE_MISMATCH')
 // Repeated identical evidence is intentionally ambiguous, never silently duplicated.
 return {start_line:content.slice(0,at).split(/\r\n|\r|\n/).length,end_line:content.slice(0,at+quote.length).split(/\r\n|\r|\n/).length,repeated:content.indexOf(quote)!==at||content.indexOf(quote,at+quote.length)!==-1}
}
export function resolveSourceDate(expression:string|null,content:string,observed:string|null){
 if(!expression || !content.includes(expression))return null
 const absolute=/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?$/.exec(expression.trim())
 if(absolute){const value=absolute[1]+'-'+absolute[2].padStart(2,'0')+'-'+absolute[3].padStart(2,'0');return dateOnly.safeParse(value).success?value:null}
 if(observed && ['今日','昨日','明日'].includes(expression)){const date=new Date(observed.slice(0,10)+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+({'今日':0,'昨日':-1,'明日':1}[expression]??0));return date.toISOString().slice(0,10)}
 return null
}
export function candidateIdentity(documentId:string,candidate:Candidate,previous:RawItem[],repeated=false,payload?:ReviewedPayload){
 const key=contentHash(documentId+'\n'+candidate.type+'\n'+normalize(candidate.quote)+'\n'+normalize(candidate.title)+'\n'+JSON.stringify([candidate.company_name,candidate.deal_name,payload?.date??candidate.date_expression,payload?.due_date??candidate.due_expression,payload?.duration_minutes??null]))
 const exact=previous.find(x=>x.stable_item_key===key)
 if(exact)return {key,comparison:'same',previous_id:exact.id}
 const possible=previous.filter(x=>x.item_type===candidate.type && (normalize(x.proposed_payload.title)===normalize(candidate.title)||normalize(x.source_quote).includes(normalize(candidate.quote))||normalize(candidate.quote).includes(normalize(x.source_quote))))
 return {key,comparison:repeated?'ambiguous':possible.length===1?'changed':possible.length>1?'ambiguous':'new',previous_id:possible.length===1?possible[0].id:null}
}
export function candidatePayload(candidate:Candidate,content:string,observed:string|null):ReviewedPayload & {company_name:string|null;deal_name:string|null}{
 return {duration_minutes:candidate.type==='work_log'?explicitDuration(candidate.quote,candidate.duration_expression):null,worker_user_id:null,title:candidate.title,body:candidate.body,date:resolveSourceDate(candidate.date_expression,content,observed),
 due_date:resolveSourceDate(candidate.due_expression,content,observed),activity_type:candidate.activity_type,rationale:candidate.rationale,company_name:candidate.company_name,deal_name:candidate.deal_name}
}
export function validateReviewed(type:string,input:unknown){const data=reviewedPayloadSchema.parse(input);if(type==='activity')throw new Error('RAW_RETIRED_TYPE');if(type==='work_log' && !data.date)throw new Error('REVIEW_DATE');if(type==='work_log'&&!data.duration_minutes)throw new Error('REVIEW_DURATION');return data}
