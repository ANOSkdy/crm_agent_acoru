import { validateRaw, RAW_PAGE_SIZE, type RawDocument, type RawRevision, type IngestResult } from './domain'
import type { CrmDatabase } from '../auth/crm-policy'
import { AppError } from '../http/errors'
export class RawRepository {
 constructor(readonly db:CrmDatabase){}
 async ingest(actor:string,input:unknown) {
  const d=validateRaw(input)
  const [row]=await this.db.query('SELECT ingest_raw_document($1::uuid,$2,$3,$4,$5,$6,$7::date,$8,$9::uuid) AS result',[actor,d.source_type,d.source_key,d.original_filename,d.relative_path,d.content,d.observed_at,d.ai_processing_allowed,d.document_id])
  return row.result as IngestResult
 }
 async list(actor:string,page=0) {
  const rows=await this.db.query(`SELECT d.id,d.source_type,d.source_key,d.original_filename,d.relative_path,d.updated_at,r.id AS revision_id,r.revision_no,r.ai_processing_allowed,
   (SELECT status FROM extraction_runs WHERE raw_revision_id=r.id ORDER BY created_at DESC LIMIT 1) AS status,
   (SELECT count(*)::integer FROM extraction_items i JOIN extraction_runs er ON er.id=i.extraction_run_id WHERE er.raw_revision_id=r.id AND i.review_status IN ('pending','needs_resolution','approved','conflict') AND i.comparison<>'same') AS pending_count
   FROM raw_documents d JOIN LATERAL(SELECT id,revision_no,ai_processing_allowed FROM raw_document_revisions WHERE document_id=d.id ORDER BY revision_no DESC LIMIT 1) r ON true
   WHERE d.created_by=$1 AND d.archived_at IS NULL ORDER BY d.updated_at DESC,d.id LIMIT $2 OFFSET $3`,[actor,RAW_PAGE_SIZE+1,page*RAW_PAGE_SIZE])
  return {documents:rows.slice(0,RAW_PAGE_SIZE) as RawDocument[],hasMore:rows.length>RAW_PAGE_SIZE}
 }
 async document(actor:string,id:string) {
  const [doc]=await this.db.query('SELECT * FROM raw_documents WHERE id=$1 AND created_by=$2 AND archived_at IS NULL',[id,actor])
  if(!doc)throw new AppError(404,'原本が見つかりません')
  const revisions=await this.db.query('SELECT id,document_id,revision_no,content_hash,observed_at::text AS observed_at,ingested_at,ai_processing_allowed FROM raw_document_revisions WHERE document_id=$1 ORDER BY revision_no DESC',[id])
  return {document:doc,revisions:revisions as RawRevision[]}
 }
 async revision(actor:string,id:string) {
  const [row]=await this.db.query(`SELECT r.*,r.observed_at::text AS observed_at,d.source_type,d.source_key,d.original_filename FROM raw_document_revisions r JOIN raw_documents d ON d.id=r.document_id WHERE r.id=$1 AND d.created_by=$2 AND d.archived_at IS NULL`,[id,actor])
  if(!row)throw new AppError(404,'原本が見つかりません')
  return row as RawRevision & {content:string}
 }
 async consent(actor:string,id:string,allowed:boolean) {
  await this.revision(actor,id)
  await this.db.query(`WITH changed AS(UPDATE raw_document_revisions SET ai_processing_allowed=$3 WHERE id=$1 AND document_id IN(SELECT id FROM raw_documents WHERE created_by=$2) RETURNING id)
   INSERT INTO audit_logs(user_id,action,target_type,target_id,after_json) SELECT $2,'raw_ai_consent','raw_revision',id,jsonb_build_object('allowed',$3::boolean) FROM changed`,[id,actor,allowed])
 }
}
