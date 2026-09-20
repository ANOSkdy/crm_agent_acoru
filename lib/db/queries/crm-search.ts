import 'server-only'
import { getSql, sql } from '@/lib/db'
import type { SearchInput, RecordInput, MetricsInput, PriorityInput } from '@/lib/assistant/schema'

export interface CrmRecord { kind: RecordInput['entity']; id: string; company_id: string | null; deal_id: string | null; title: string; company_name: string | null; occurred_on: string | null; status: string | null; data: Record<string, unknown>; updated_at: string; excerpt?: string }
export function recordHref(record: Pick<CrmRecord, 'kind' | 'id' | 'deal_id' | 'company_id'>) {
  switch (record.kind) {
    case 'company': return `/companies/${record.id}`
    case 'deal': return `/deals/${record.id}`
    case 'contact': return `/contacts/${record.id}/edit`
    case 'activity': return `/activities/${record.id}/edit`
    case 'task': return `/tasks/${record.id}/edit`
    case 'decision': return `/deals/${record.deal_id}#decision-${record.id}`
    case 'file': return `/files/${record.id}/edit`
  }
}
export async function searchCrm(input: SearchInput) {
  const { entity, company_id, deal_id, status, date_from, date_to, offset } = input
  // Escaped literal substring search. Values never become SQL syntax.
  const pattern = '%' + input.query.replace(/[\\%_]/g, '\\$&') + '%'
  const rows = await sql`WITH matched AS (
    SELECT * FROM crm_ai_records WHERE (${entity} = 'all' OR kind = ${entity})
      AND (${company_id}::uuid IS NULL OR company_id = ${company_id}::uuid)
      AND (${deal_id}::uuid IS NULL OR deal_id = ${deal_id}::uuid)
      AND (${status}::text IS NULL OR status = ${status})
      AND (${date_from}::date IS NULL OR occurred_on >= ${date_from}::date)
      AND (${date_to}::date IS NULL OR occurred_on <= ${date_to}::date)
      AND (body ILIKE ${pattern} OR data::text ILIKE ${pattern})
  ) SELECT (SELECT count(*)::int FROM matched) AS total,
    COALESCE((SELECT jsonb_agg(x) FROM (SELECT kind,id,company_id,deal_id,title,company_name,occurred_on,status,left(body,600) AS excerpt,updated_at FROM matched ORDER BY updated_at DESC,id LIMIT 20 OFFSET ${offset}) x),'[]'::jsonb) AS records`
  return { total: Number(rows[0].total), records: rows[0].records as CrmRecord[], offset, has_more: offset + 20 < Number(rows[0].total) }
}
export async function getCrmRecord(input: RecordInput) {
  const rows = await sql`SELECT kind,id,company_id,deal_id,title,company_name,occurred_on,status,data,updated_at FROM crm_ai_records WHERE kind=${input.entity} AND id=${input.id}`
  return (rows[0] ?? null) as CrmRecord | null
}
export async function getCrmMetrics({ company_id, close_from, close_to }: MetricsInput) {
  const rows = await sql`WITH d AS (
    SELECT d.* FROM deals d JOIN companies c ON c.id=d.company_id WHERE d.deleted_at IS NULL AND c.deleted_at IS NULL
      AND (${company_id}::uuid IS NULL OR d.company_id=${company_id}::uuid)
      AND (${close_from}::date IS NULL OR expected_close_date>=${close_from}::date)
      AND (${close_to}::date IS NULL OR expected_close_date<=${close_to}::date)
  ), t AS (SELECT * FROM crm_ai_records WHERE kind='task' AND (${company_id}::uuid IS NULL OR company_id=${company_id}::uuid))
  SELECT jsonb_build_object(
    'as_of',now(),'timezone','Asia/Tokyo','filters',jsonb_build_object('company_id',${company_id}::text,'expected_close_from',${close_from}::text,'expected_close_to',${close_to}::text),
    'companies',(SELECT count(*) FROM companies WHERE deleted_at IS NULL AND (${company_id}::uuid IS NULL OR id=${company_id}::uuid)),
    'deals',(SELECT jsonb_build_object('total',count(*),'open',count(*) FILTER(WHERE status='open'),'won',count(*) FILTER(WHERE status='won'),'lost',count(*) FILTER(WHERE status='lost'),'open_amount_yen',coalesce(sum(amount) FILTER(WHERE status='open'),0),'weighted_open_amount_yen',coalesce(sum(amount*probability/100) FILTER(WHERE status='open'),0)) FROM d),
    'by_stage',(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (SELECT coalesce(s.name,'未設定') AS stage,count(*) AS count,coalesce(sum(d.amount),0) AS amount_yen FROM d LEFT JOIN deal_stages s ON s.id=d.stage_id WHERE d.status='open' GROUP BY s.name) x),
    'tasks',(SELECT jsonb_build_object('open',count(*) FILTER(WHERE status<>'done'),'overdue',count(*) FILTER(WHERE status<>'done' AND occurred_on<(now() AT TIME ZONE 'Asia/Tokyo')::date),'due_today',count(*) FILTER(WHERE status<>'done' AND occurred_on=(now() AT TIME ZONE 'Asia/Tokyo')::date)) FROM t),
    'notes','案件は受注予定日で絞り込み。顧客数・タスク数には案件の日付条件を適用しない。金額は円。確度加重金額は予測であり確約額ではない。'
  ) AS metrics`
  return rows[0].metrics as Record<string, unknown>
}
export async function getPriorityItems(input: PriorityInput) {
  const { category, company_id, offset } = input
  const rows = await sql`WITH matched AS (
    SELECT r.* FROM crm_ai_records r WHERE (${company_id}::uuid IS NULL OR r.company_id=${company_id}::uuid) AND (
      (${category}='overdue_tasks' AND kind='task' AND status<>'done' AND occurred_on<(now() AT TIME ZONE 'Asia/Tokyo')::date)
      OR (${category}='closing_soon' AND kind='deal' AND status='open' AND occurred_on BETWEEN (now() AT TIME ZONE 'Asia/Tokyo')::date AND (now() AT TIME ZONE 'Asia/Tokyo')::date+30)
      OR (${category}='at_risk' AND kind='deal' AND status='open' AND data->>'health' IN ('at_risk','blocked'))
      OR (${category}='stale_deals' AND kind='deal' AND status='open' AND NOT EXISTS(SELECT 1 FROM activities a WHERE a.deal_id=r.id AND a.deleted_at IS NULL AND a.activity_date>=now()-interval '14 days'))
    )
  ) SELECT (SELECT count(*)::int FROM matched) AS total, coalesce((SELECT jsonb_agg(x) FROM (SELECT kind,id,company_id,deal_id,title,company_name,occurred_on,status,data,updated_at FROM matched ORDER BY occurred_on NULLS LAST,id LIMIT 20 OFFSET ${offset}) x),'[]'::jsonb) AS records`
  return { category, total: Number(rows[0].total), records: rows[0].records as CrmRecord[], offset, has_more: offset+20<Number(rows[0].total), definition: category==='stale_deals' ? '14日間、案件に紐づく活動記録がない進行中案件。実際の停滞を断定するものではない。' : category==='closing_soon' ? '本日から30日後までに受注予定の進行中案件。' : '記録上の状態と日本時間の本日を基準に抽出。' }
}
export async function getDealProgress(dealId: string) {
  const db = getSql()
  const results = await db.transaction([db`SELECT * FROM deal_contexts WHERE deal_id=${dealId}`, db`SELECT id,content,rationale,created_at FROM deal_decisions WHERE deal_id=${dealId} ORDER BY created_at DESC LIMIT 20`])
  return { context: results[0][0], decisions: results[1] }
}
