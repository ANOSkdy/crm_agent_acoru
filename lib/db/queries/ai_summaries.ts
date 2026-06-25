import 'server-only'
import { sql } from '@/lib/db'

export interface AiSummary {
  id: string
  company_id: string | null
  deal_id: string | null
  summary_type: string
  source_hash: string | null
  content: string
  generated_by: string | null
  created_at: string
}

type Row = Record<string, unknown>
function toSummary(r: Row): AiSummary { return r as unknown as AiSummary }

export async function getAiSummaries(companyId?: string, dealId?: string): Promise<AiSummary[]> {
  let rows: Row[]
  if (companyId && dealId) {
    rows = await sql`
      SELECT * FROM ai_summaries
      WHERE company_id = ${companyId} OR deal_id = ${dealId}
      ORDER BY created_at DESC
    `
  } else if (companyId) {
    rows = await sql`
      SELECT * FROM ai_summaries WHERE company_id = ${companyId}
      ORDER BY created_at DESC
    `
  } else if (dealId) {
    rows = await sql`
      SELECT * FROM ai_summaries WHERE deal_id = ${dealId}
      ORDER BY created_at DESC
    `
  } else {
    rows = await sql`SELECT * FROM ai_summaries ORDER BY created_at DESC`
  }
  return rows.map(toSummary)
}

export async function createAiSummary(data: {
  company_id?: string
  deal_id?: string
  summary_type: string
  source_hash?: string
  content: string
}): Promise<AiSummary> {
  const rows = await sql`
    INSERT INTO ai_summaries (company_id, deal_id, summary_type, source_hash, content)
    VALUES (
      ${data.company_id ?? null},
      ${data.deal_id ?? null},
      ${data.summary_type},
      ${data.source_hash ?? null},
      ${data.content}
    )
    RETURNING *
  `
  return toSummary(rows[0])
}
