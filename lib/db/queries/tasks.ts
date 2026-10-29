import 'server-only'
import { sql, getSql } from '@/lib/db'
import { toDateInputValue } from '@/lib/utils/date'
import type { CreateTaskInput, UpdateTaskInput, taskStatusLabels } from '@/lib/validation/task'
export interface Task {
  id: string
  company_id: string | null
  company_name?: string
  deal_id: string | null
  issue_number: number
  opened_on: string
  title: string
  completion_criteria: string
  due_date: string | null
  progress: string
  status: keyof typeof taskStatusLabels
  assigned_to: string | null
  created_by: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export type TaskTab = { company_id: string; company_name: string }
export type TaskEditableField = 'issue_number' | 'opened_on' | 'title' | 'completion_criteria' | 'due_date' | 'progress' | 'status'
const toTask = (row: Record<string, unknown>): Task => ({
  ...row,
  opened_on: toDateInputValue(row.opened_on as string | Date),
  due_date: row.due_date ? toDateInputValue(row.due_date as string | Date) : null,
} as unknown as Task)
export async function getTasks(filters?: { companyId?: string; dealId?: string; status?: string }): Promise<Task[]> {
  const rows = await sql`SELECT t.*, c.name AS company_name FROM crm_live_tasks t LEFT JOIN companies c ON c.id = t.company_id
    WHERE (${filters?.companyId ?? null}::uuid IS NULL OR t.company_id = ${filters?.companyId ?? null}::uuid)
      AND (${filters?.dealId ?? null}::uuid IS NULL OR t.deal_id = ${filters?.dealId ?? null}::uuid)
      AND (${filters?.status ?? null}::text IS NULL OR t.status = ${filters?.status ?? null})
    ORDER BY t.issue_number, t.id`
  return rows.map(toTask)
}
export const getTasksByCompany = (companyId: string) => getTasks({ companyId })
export async function getTaskById(id: string): Promise<Task | null> {
  const rows = await sql`SELECT t.*, c.name AS company_name FROM crm_live_tasks t LEFT JOIN companies c ON c.id = t.company_id WHERE t.id = ${id}`
  return rows[0] ? toTask(rows[0]) : null
}
export async function getTaskTabs(): Promise<TaskTab[]> {
  return await sql`SELECT b.company_id, c.name AS company_name FROM task_company_tabs b
    JOIN companies c ON c.id = b.company_id AND c.deleted_at IS NULL ORDER BY b.created_at, b.company_id` as TaskTab[]
}
export async function addTaskTab(companyId: string, userId: string): Promise<void> {
  await sql`INSERT INTO task_company_tabs(company_id, created_by) SELECT id, ${userId} FROM companies
    WHERE id = ${companyId} AND deleted_at IS NULL ON CONFLICT (company_id) DO NOTHING`
}
export async function createTask(data: CreateTaskInput & { created_by: string; assigned_to: string }): Promise<Task> {
  const rows = await sql`INSERT INTO tasks
    (company_id, issue_number, opened_on, title, completion_criteria, due_date, progress, status, created_by, assigned_to, completed_at)
    VALUES (${data.company_id}, ${data.issue_number ?? null}, ${data.opened_on}, ${data.title}, ${data.completion_criteria},
      ${data.due_date}, ${data.progress}, ${data.status}, ${data.created_by}, ${data.assigned_to},
      CASE WHEN ${data.status} = 'done' THEN now() ELSE NULL END) RETURNING *`
  return toTask(rows[0])
}
export async function updateTask(id: string, data: UpdateTaskInput): Promise<Task | null> {
  const rows = await sql`UPDATE tasks SET company_id = ${data.company_id ?? null}, issue_number = ${data.issue_number},
    opened_on = ${data.opened_on}, title = ${data.title}, completion_criteria = ${data.completion_criteria},
    due_date = ${data.due_date}, progress = ${data.progress}, status = ${data.status},
    completed_at = CASE WHEN ${data.status} = 'done' THEN COALESCE(completed_at, now()) ELSE NULL END, updated_at = now()
    WHERE id = ${id} AND deleted_at IS NULL RETURNING *`
  return rows[0] ? toTask(rows[0]) : null
}
export async function deleteTask(id: string): Promise<void> {
  await sql`UPDATE tasks SET deleted_at = now(), updated_at = now() WHERE id = ${id} AND deleted_at IS NULL`
}
export async function updateTaskGridFields(id: string, data: Partial<Pick<Task, TaskEditableField>>): Promise<Task | null> {
  const allowed: TaskEditableField[] = ['issue_number', 'opened_on', 'title', 'completion_criteria', 'due_date', 'progress', 'status']
  const fields = allowed.filter(field => Object.hasOwn(data, field))
  if (!fields.length) return getTaskById(id)
  // Column identifiers come exclusively from the allowlist; values are parameterized.
  const values: unknown[] = fields.map(field => data[field])
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`)
  if (fields.includes('status')) {
    const position = fields.indexOf('status') + 1
    assignments.push(`completed_at = CASE WHEN $${position} = 'done' THEN COALESCE(completed_at, now()) ELSE NULL END`)
  }
  values.push(id)
  const rows = await getSql().query(`UPDATE tasks SET ${assignments.join(', ')}, updated_at = now()
    WHERE id = $${values.length} AND deleted_at IS NULL RETURNING id`, values)
  return rows[0] ? getTaskById(String(rows[0].id)) : null
}
