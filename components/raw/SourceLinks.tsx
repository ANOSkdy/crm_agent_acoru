import 'server-only'
import Link from 'next/link'
import { rawDatabase,rawUser,rawFlags } from '@/lib/raw/server'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
export async function SourceLinks({type,id,dealId}:{type?:string;id?:string;dealId?:string}){
 if(!Object.values(rawFlags()).some(Boolean))return null
 const user=await rawUser()
 const sources=await rawDatabase.query(`SELECT i.id,i.item_type,i.applied_id,i.reviewed_payload->>'title' AS title,r.id AS run_id,r.raw_revision_id,d.original_filename,d.relative_path
 FROM extraction_items i JOIN extraction_runs r ON r.id=i.extraction_run_id JOIN raw_documents d ON d.id=i.document_id
 WHERE d.created_by=$1 AND d.archived_at IS NULL AND i.review_status='applied'
 AND (($2::uuid IS NOT NULL AND i.deal_id=$2) OR ($3::text IS NOT NULL AND i.applied_type=$3 AND i.applied_id=$4::uuid))
 ORDER BY i.applied_at DESC LIMIT 100`,[user.id,dealId??null,type??null,id??null])
 if(!sources.length)return null
 return <Card><CardHeader><h2 className="font-semibold">業務ログの出典</h2></CardHeader><CardBody><ul className="divide-y divide-gray-100">{sources.map(s=><li className="py-3 first:pt-0 last:pb-0" key={String(s.id)}><Link className="crm-grid__link text-sm break-all hover:underline" href={'/raw?revision='+s.raw_revision_id+'&run='+s.run_id+'#item-'+s.id}>{String(s.title)}</Link><p className="text-xs text-gray-500 mt-1 break-all">{String(s.relative_path??s.original_filename??'貼り付け原文')}</p></li>)}</ul></CardBody></Card>
}
