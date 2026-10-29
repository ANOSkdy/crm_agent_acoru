import { createHash } from 'node:crypto'
import { z } from 'zod'
import { dateOnly } from '../validation/date'
import { RAW_MAX_BYTES } from './constants'
export { RAW_MAX_BYTES, RAW_MAX_FILES, RAW_PAGE_SIZE, RAW_CHUNK_CHARS } from './constants'
export const rawSourceSchema=z.enum(['paste','upload','local_sync'])
export const rawInputSchema=z.object({
 source_type:rawSourceSchema, source_key:z.string().min(1).max(200),
 document_id:z.uuid().nullable().default(null),
 original_filename:z.string().max(255).nullable().default(null),
 relative_path:z.string().max(1000).nullable().default(null),
 content:z.string().min(1), content_hash:z.string().regex(/^[a-f0-9]{64}$/).optional(),
 observed_at:dateOnly.nullable().default(null), ai_processing_allowed:z.boolean().default(false),
}).strict()
export type RawInput=z.infer<typeof rawInputSchema>
export type IngestResult={status:'unchanged'|'created_document'|'created_revision';document_id:string;revision_id:string;content_hash:string}
export function contentHash(content:string) { return createHash('sha256').update(content,'utf8').digest('hex') }
export function decodeRaw(bytes:Uint8Array,filename?:string) {
 if(bytes.byteLength===0 || bytes.byteLength>RAW_MAX_BYTES)throw new Error('RAW_SIZE')
 if(filename && !/\.(md|txt)$/i.test(filename))throw new Error('RAW_EXTENSION')
 let content:string
 try {content=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes)}catch{throw new Error('RAW_ENCODING')}
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(content))throw new Error('RAW_BINARY')
 return content
}
export function validateRaw(input:unknown):RawInput {
 const data=rawInputSchema.parse(input)
 const bytes=new TextEncoder().encode(data.content)
 if(decodeRaw(bytes,data.source_type==='paste'?undefined:data.original_filename??'')!==data.content)throw new Error('RAW_ENCODING')
 if(!data.content.trim())throw new Error('RAW_EMPTY')
 if(data.source_type!=='paste' && !data.original_filename)throw new Error('RAW_EXTENSION')
 if(data.original_filename && /[\\/\u0000-\u001f]/.test(data.original_filename))throw new Error('RAW_FILENAME')
 if(data.relative_path && (/[\u0000-\u001f\u007f]/.test(data.relative_path)||data.relative_path.startsWith('/')||data.relative_path.includes('\\')||data.relative_path.split('/').some(x=>!x||x==='..'||x==='.'||x.startsWith('.'))||/^[a-z]:/i.test(data.relative_path)))throw new Error('RAW_PATH')
 if(data.source_type==='local_sync' && (!z.uuid().safeParse(data.source_key).success||!data.relative_path))throw new Error('RAW_IDENTITY')
 if(data.content_hash && data.content_hash!==contentHash(data.content))throw new Error('RAW_HASH')
 return data
}
export type RawDocument={id:string;source_type:string;source_key:string;original_filename:string|null;relative_path:string|null;updated_at:string;revision_id:string;revision_no:number;ai_processing_allowed:boolean;status?:string;pending_count?:number}
export type RawRevision={id:string;document_id:string;revision_no:number;content_hash:string;observed_at:string|null;ingested_at:string;ai_processing_allowed:boolean;content?:string}
