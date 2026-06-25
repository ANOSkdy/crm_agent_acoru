import 'server-only'
import { sql } from '@/lib/db'

export interface Activity {
  id: string
  company_id: string
  company_name?: string
  contact_id: string | null
  contact_name?: string
  deal_id: string | null
  type: string
  activity_date: string
  summary: string
  body: string | null
  next_action: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

type Row = Record<string, unknown>
function toActivity(r: Row): Activity { return r as unknown as Activity }
function emptyToNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
function emptyToNullUuid(value: unknown): string | null { return emptyToNull(value) }

export async function getActivities(filters?: { companyId?: string; dealId?: string }): Promise<Activity[]> {
  const companyId = filters?.companyId ?? null
  const dealId = filters?.dealId ?? null

  let rows: Row[]
  if (companyId) {
    rows = await sql`
      SELECT a.*, co.name as company_name, ct.name as contact_name
      FROM activities a
      LEFT JOIN companies co ON co.id = a.company_id
      LEFT JOIN contacts ct ON ct.id = a.contact_id
      WHERE a.deleted_at IS NULL AND a.company_id = ${companyId}
      ORDER BY a.activity_date DESC
    `
  } else if (dealId) {
    rows = await sql`
      SELECT a.*, co.name as company_name, ct.name as contact_name
      FROM activities a
      LEFT JOIN companies co ON co.id = a.company_id
      LEFT JOIN contacts ct ON ct.id = a.contact_id
      WHERE a.deleted_at IS NULL AND a.deal_id = ${dealId}
      ORDER BY a.activity_date DESC
    `
  } else {
    rows = await sql`
      SELECT a.*, co.name as company_name, ct.name as contact_name
      FROM activities a
      LEFT JOIN companies co ON co.id = a.company_id
      LEFT JOIN contacts ct ON ct.id = a.contact_id
      WHERE a.deleted_at IS NULL
      ORDER BY a.activity_date DESC
    `
  }
  return rows.map(toActivity)
}

export async function getActivitiesByCompany(companyId: string): Promise<Activity[]> {
  return getActivities({ companyId })
}

export async function getActivityById(id: string): Promise<Activity | null> {
  const rows = await sql`
    SELECT a.*, co.name as company_name, ct.name as contact_name
    FROM activities a
    LEFT JOIN companies co ON co.id = a.company_id
    LEFT JOIN contacts ct ON ct.id = a.contact_id
    WHERE a.id = ${id} AND a.deleted_at IS NULL
  `
  return rows[0] ? toActivity(rows[0]) : null
}

export async function createActivity(data: {
  company_id: string
  contact_id?: string
  deal_id?: string
  type: string
  activity_date: string
  summary: string
  body?: string
  next_action?: string
}): Promise<Activity> {
  const rows = await sql`
    INSERT INTO activities (company_id, contact_id, deal_id, type, activity_date, summary, body, next_action)
    VALUES (
      ${data.company_id},
      ${data.contact_id ?? null},
      ${data.deal_id ?? null},
      ${data.type},
      ${data.activity_date},
      ${data.summary},
      ${data.body ?? null},
      ${data.next_action ?? null}
    )
    RETURNING *
  `
  return toActivity(rows[0])
}

export async function updateActivity(id: string, data: { company_id: string; contact_id?: string; deal_id?: string; type: string; activity_date: string; summary: string; body?: string; next_action?: string }): Promise<Activity | null> {
  const rows = await sql`
    UPDATE activities SET
      company_id = ${data.company_id},
      contact_id = ${emptyToNullUuid(data.contact_id)},
      deal_id = ${emptyToNullUuid(data.deal_id)},
      type = ${data.type},
      activity_date = ${data.activity_date},
      summary = ${data.summary},
      body = ${emptyToNull(data.body)},
      next_action = ${emptyToNull(data.next_action)},
      updated_at = now()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING *
  `
  return rows[0] ? toActivity(rows[0]) : null
}

export async function deleteActivity(id: string): Promise<void> {
  await sql`UPDATE activities SET deleted_at = now() WHERE id = ${id}`
}
