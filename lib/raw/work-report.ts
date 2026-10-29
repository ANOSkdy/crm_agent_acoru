import { z } from 'zod'
import { dateOnly } from '../validation/date'
import type { CrmDatabase } from '../auth/crm-policy'
export const workFiltersSchema=z.object({from:dateOnly.nullable().default(null),to:dateOnly.nullable().default(null),company_id:z.uuid().nullable().default(null),deal_id:z.uuid().nullable().default(null)}).strict()
export type WorkFilters=z.infer<typeof workFiltersSchema>
export async function getWorkReport(db:CrmDatabase,filters:WorkFilters){
 if(filters.from&&filters.to&&filters.from>filters.to)throw new Error('WORK_DATE_RANGE')
 const [row]=await db.query(`WITH filtered AS(
 SELECT w.*,c.name AS company_name,d.title AS deal_title,u.name AS worker_name FROM confirmed_work_logs w
 LEFT JOIN companies c ON c.id=w.company_id LEFT JOIN deals d ON d.id=w.deal_id LEFT JOIN users u ON u.id=w.worker_user_id
 WHERE ($1::date IS NULL OR worked_on>=$1) AND ($2::date IS NULL OR worked_on<=$2)
 AND ($3::uuid IS NULL OR w.company_id=$3) AND ($4::uuid IS NULL OR w.deal_id=$4))
 SELECT jsonb_build_object(
 'total_minutes',(SELECT COALESCE(sum(duration_minutes),0) FROM filtered),
 'unallocated_minutes',(SELECT COALESCE(sum(duration_minutes),0) FROM filtered WHERE deal_id IS NULL),
 'daily',(SELECT COALESCE(jsonb_agg(x),'[]') FROM(SELECT worked_on,sum(duration_minutes) AS minutes FROM filtered GROUP BY worked_on ORDER BY worked_on) x),
 'companies',(SELECT COALESCE(jsonb_agg(x),'[]') FROM(SELECT company_id,company_name,sum(duration_minutes) AS minutes FROM filtered GROUP BY company_id,company_name ORDER BY minutes DESC) x),
 'deals',(SELECT COALESCE(jsonb_agg(x),'[]') FROM(SELECT deal_id,deal_title,sum(duration_minutes) AS minutes FROM filtered GROUP BY deal_id,deal_title ORDER BY minutes DESC) x),
 'total_records',(SELECT count(*) FROM filtered),
 'records',(SELECT COALESCE(jsonb_agg(x),'[]') FROM(SELECT * FROM filtered ORDER BY worked_on DESC,created_at DESC LIMIT 100) x)
 ) AS report`,[filters.from,filters.to,filters.company_id,filters.deal_id])
 return row.report as WorkReport
}
export type WorkReport={total_minutes:number;unallocated_minutes:number;total_records:number;daily:{worked_on:string;minutes:number}[];companies:{company_id:string|null;company_name:string|null;minutes:number}[];deals:{deal_id:string|null;deal_title:string|null;minutes:number}[];records:{id:string;worked_on:string;duration_minutes:number;description:string;company_name:string|null;deal_title:string|null;worker_name:string|null;extraction_item_id:string|null}[]}
