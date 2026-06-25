import 'server-only'
import { sql } from '@/lib/db'

export interface Task {
  id: string
  company_id: string | null
  company_name?: string
  deal_id: string | null
  title: string
  description: string | null
  due_date: string | null
  priority: string
  status: string
  assigned_to: string | null
  created_by: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

type Row = Record<string, unknown>
function toTask(r: Row): Task { return r as unknown as Task }

export async function getTasks(filters?: { companyId?: string; dealId?: string; status?: string }): Promise<Task[]> {
  const companyId = filters?.companyId ?? null
  const dealId = filters?.dealId ?? null
  const status = filters?.status ?? null

  let rows: Row[]
  if (companyId) {
    rows = await sql`
      SELECT t.*, co.name as company_name FROM tasks t
      LEFT JOIN companies co ON co.id = t.company_id
      WHERE t.deleted_at IS NULL AND t.company_id = ${companyId}
      ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC
    `
  } else if (dealId) {
    rows = await sql`
      SELECT t.*, co.name as company_name FROM tasks t
      LEFT JOIN companies co ON co.id = t.company_id
      WHERE t.deleted_at IS NULL AND t.deal_id = ${dealId}
      ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC
    `
  } else if (status) {
    rows = await sql`
      SELECT t.*, co.name as company_name FROM tasks t
      LEFT JOIN companies co ON co.id = t.company_id
      WHERE t.deleted_at IS NULL AND t.status = ${status}
      ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC
    `
  } else {
    rows = await sql`
      SELECT t.*, co.name as company_name FROM tasks t
      LEFT JOIN companies co ON co.id = t.company_id
      WHERE t.deleted_at IS NULL
      ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC
    `
  }
  return rows.map(toTask)
}

export async function getTasksByCompany(companyId: string): Promise<Task[]> {
  return getTasks({ companyId })
}

export async function createTask(data: {
  company_id?: string
  deal_id?: string
  title: string
  description?: string
  due_date?: string
  priority?: string
  assigned_to?: string
}): Promise<Task> {
  const rows = await sql`
    INSERT INTO tasks (company_id, deal_id, title, description, due_date, priority)
    VALUES (
      ${data.company_id ?? null},
      ${data.deal_id ?? null},
      ${data.title},
      ${data.description ?? null},
      ${data.due_date ?? null},
      ${data.priority ?? 'medium'}
    )
    RETURNING *
  `
  return toTask(rows[0])
}

export async function completeTask(id: string): Promise<void> {
  await sql`
    UPDATE tasks SET status = 'done', completed_at = now(), updated_at = now()
    WHERE id = ${id}
  `
}

export async function deleteTask(id: string): Promise<void> {
  await sql`UPDATE tasks SET deleted_at = now() WHERE id = ${id}`
}
