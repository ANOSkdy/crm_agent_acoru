import 'server-only'
import { sql } from '@/lib/db'

export interface DealStage {
  id: string
  name: string
  sort_order: number
  default_probability: number
  is_closed: boolean
  is_won: boolean
  created_at: string
}

export interface Deal {
  id: string
  company_id: string
  company_name?: string
  title: string
  amount: number
  stage_id: string | null
  stage_name?: string
  probability: number
  expected_close_date: string | null
  owner_user_id: string | null
  status: string
  memo: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

type Row = Record<string, unknown>
function toDeal(r: Row): Deal { return r as unknown as Deal }
function toStage(r: Row): DealStage { return r as unknown as DealStage }

export async function getDeals(filters?: { companyId?: string; stageId?: string; status?: string }): Promise<Deal[]> {
  const companyId = filters?.companyId ?? null
  const stageId = filters?.stageId ?? null
  const status = filters?.status ?? null

  let rows: Row[]
  if (companyId && stageId && status) {
    rows = await sql`
      SELECT d.*, co.name as company_name, ds.name as stage_name
      FROM deals d
      LEFT JOIN companies co ON co.id = d.company_id
      LEFT JOIN deal_stages ds ON ds.id = d.stage_id
      WHERE d.deleted_at IS NULL
        AND d.company_id = ${companyId}
        AND d.stage_id = ${stageId}
        AND d.status = ${status}
      ORDER BY d.created_at DESC
    `
  } else if (companyId && stageId) {
    rows = await sql`
      SELECT d.*, co.name as company_name, ds.name as stage_name
      FROM deals d
      LEFT JOIN companies co ON co.id = d.company_id
      LEFT JOIN deal_stages ds ON ds.id = d.stage_id
      WHERE d.deleted_at IS NULL AND d.company_id = ${companyId} AND d.stage_id = ${stageId}
      ORDER BY d.created_at DESC
    `
  } else if (companyId && status) {
    rows = await sql`
      SELECT d.*, co.name as company_name, ds.name as stage_name
      FROM deals d
      LEFT JOIN companies co ON co.id = d.company_id
      LEFT JOIN deal_stages ds ON ds.id = d.stage_id
      WHERE d.deleted_at IS NULL AND d.company_id = ${companyId} AND d.status = ${status}
      ORDER BY d.created_at DESC
    `
  } else if (companyId) {
    rows = await sql`
      SELECT d.*, co.name as company_name, ds.name as stage_name
      FROM deals d
      LEFT JOIN companies co ON co.id = d.company_id
      LEFT JOIN deal_stages ds ON ds.id = d.stage_id
      WHERE d.deleted_at IS NULL AND d.company_id = ${companyId}
      ORDER BY d.created_at DESC
    `
  } else if (stageId) {
    rows = await sql`
      SELECT d.*, co.name as company_name, ds.name as stage_name
      FROM deals d
      LEFT JOIN companies co ON co.id = d.company_id
      LEFT JOIN deal_stages ds ON ds.id = d.stage_id
      WHERE d.deleted_at IS NULL AND d.stage_id = ${stageId}
      ORDER BY d.created_at DESC
    `
  } else if (status) {
    rows = await sql`
      SELECT d.*, co.name as company_name, ds.name as stage_name
      FROM deals d
      LEFT JOIN companies co ON co.id = d.company_id
      LEFT JOIN deal_stages ds ON ds.id = d.stage_id
      WHERE d.deleted_at IS NULL AND d.status = ${status}
      ORDER BY d.created_at DESC
    `
  } else {
    rows = await sql`
      SELECT d.*, co.name as company_name, ds.name as stage_name
      FROM deals d
      LEFT JOIN companies co ON co.id = d.company_id
      LEFT JOIN deal_stages ds ON ds.id = d.stage_id
      WHERE d.deleted_at IS NULL
      ORDER BY d.created_at DESC
    `
  }
  return rows.map(toDeal)
}

export async function getDealById(id: string): Promise<Deal | null> {
  const rows = await sql`
    SELECT d.*, co.name as company_name, ds.name as stage_name
    FROM deals d
    LEFT JOIN companies co ON co.id = d.company_id
    LEFT JOIN deal_stages ds ON ds.id = d.stage_id
    WHERE d.id = ${id} AND d.deleted_at IS NULL
  `
  return rows[0] ? toDeal(rows[0]) : null
}

export async function getDealStages(): Promise<DealStage[]> {
  const rows = await sql`SELECT * FROM deal_stages ORDER BY sort_order`
  return rows.map(toStage)
}

export async function createDeal(data: {
  company_id: string
  title: string
  amount?: number
  stage_id?: string
  probability?: number
  expected_close_date?: string
  owner_user_id?: string
  memo?: string
}): Promise<Deal> {
  const rows = await sql`
    INSERT INTO deals (company_id, title, amount, stage_id, probability, expected_close_date, owner_user_id, memo)
    VALUES (
      ${data.company_id},
      ${data.title},
      ${data.amount ?? 0},
      ${data.stage_id ?? null},
      ${data.probability ?? 0},
      ${data.expected_close_date ?? null},
      ${data.owner_user_id ?? null},
      ${data.memo ?? null}
    )
    RETURNING *
  `
  const deal = toDeal(rows[0])
  await sql`
    INSERT INTO audit_logs (action, target_type, target_id, after_json)
    VALUES ('create', 'deal', ${deal.id}, ${JSON.stringify(deal)}::jsonb)
  `
  return deal
}

export async function updateDeal(
  id: string,
  data: Partial<{
    title: string
    amount: number
    stage_id: string
    probability: number
    expected_close_date: string
    owner_user_id: string
    status: string
    memo: string
  }>
): Promise<Deal | null> {
  const rows = await sql`
    UPDATE deals SET
      title = COALESCE(${data.title ?? null}, title),
      amount = COALESCE(${data.amount ?? null}, amount),
      stage_id = COALESCE(${data.stage_id ?? null}, stage_id),
      probability = COALESCE(${data.probability ?? null}, probability),
      expected_close_date = COALESCE(${data.expected_close_date ?? null}, expected_close_date),
      owner_user_id = COALESCE(${data.owner_user_id ?? null}, owner_user_id),
      status = COALESCE(${data.status ?? null}, status),
      memo = COALESCE(${data.memo ?? null}, memo),
      updated_at = now()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING *
  `
  return rows[0] ? toDeal(rows[0]) : null
}

export async function deleteDeal(id: string): Promise<void> {
  await sql`UPDATE deals SET deleted_at = now() WHERE id = ${id}`
  await sql`
    INSERT INTO audit_logs (action, target_type, target_id)
    VALUES ('delete', 'deal', ${id})
  `
}

export async function updateDealGridFields(id: string, data: Partial<Pick<Deal, 'title' | 'amount' | 'probability' | 'expected_close_date' | 'status'>>): Promise<Deal | null> {
  const before = await getDealById(id)
  if (!before) return null
  const rows = await sql`
    UPDATE deals SET
      title = ${Object.hasOwn(data, 'title') ? data.title : before.title},
      amount = ${Object.hasOwn(data, 'amount') ? data.amount : before.amount},
      probability = ${Object.hasOwn(data, 'probability') ? data.probability : before.probability},
      expected_close_date = ${Object.hasOwn(data, 'expected_close_date') ? data.expected_close_date : before.expected_close_date},
      status = ${Object.hasOwn(data, 'status') ? data.status : before.status},
      updated_at = now()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING *
  `
  return rows[0] ? getDealById(String(rows[0].id)) : null
}
