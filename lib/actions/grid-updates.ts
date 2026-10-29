'use server'

import { revalidatePath } from 'next/cache'
import { taskFieldsSchema } from '@/lib/validation/task'
import { requireCrmRelations, requireContactWrite, recordCrmActor } from '@/lib/auth/crm-permissions'
import { AppError } from '@/lib/http/errors'
import { updateCompany, type Company } from '@/lib/db/queries/companies'
import { updateDealGridFields, type Deal } from '@/lib/db/queries/deals'
import { updateContactGridFields, type Contact } from '@/lib/db/queries/contacts'
import { updateTaskGridFields, type Task } from '@/lib/db/queries/tasks'
import { requireDealAccess, requireTaskWrite } from '@/lib/auth/deal-permissions'

export type GridActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

export type CompanyGridEditableField = 'name' | 'industry' | 'phone' | 'status'
export type DealGridEditableField = 'title' | 'amount' | 'probability' | 'expected_close_date' | 'status'
export type ContactGridEditableField = 'name' | 'department' | 'position' | 'email' | 'phone' | 'is_decision_maker'
export type TaskGridEditableField = import('@/lib/db/queries/tasks').TaskEditableField

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const datePattern = /^\d{4}-\d{2}-\d{2}$/

function validId(id: string) { return typeof id === 'string' && id.length > 0 }
function requiredText(value: unknown, label: string) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw new Error(`${label}は必須です`)
  return text
}
function optionalText(value: unknown) {
  if (value == null) return null
  const text = String(value).trim()
  return text ? text : null
}
function selectValue<T extends string>(value: unknown, allowed: readonly T[]) {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error('選択値が不正です')
  return value as T
}
function numberValue(value: unknown, label: string, min: number, max = Number.POSITIVE_INFINITY) {
  const number = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''))
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${label}が不正です`)
  return number
}
function optionalDate(value: unknown) {
  const text = optionalText(value)
  if (text === null) return null
  if (!datePattern.test(text)) throw new Error('日付はYYYY-MM-DDで入力してください')
  return text
}
function optionalEmail(value: unknown) {
  const text = optionalText(value)
  if (text !== null && !emailPattern.test(text)) throw new Error('メールアドレスが不正です')
  return text
}
function checkboxValue(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  const text = String(value).trim().toLowerCase()
  if (['true', '1', 'yes', 'はい', '✓'].includes(text)) return true
  if (['false', '0', 'no', 'いいえ', ''].includes(text)) return false
  throw new Error('チェックボックス値が不正です')
}
function fail(error: unknown): GridActionResult<never> {
  return { ok: false, error: error instanceof AppError ? error.message : '更新できませんでした。入力内容と権限を確認してください' }
}

export async function updateCompanyGridCellAction(id: string, field: CompanyGridEditableField, value: unknown): Promise<GridActionResult<Company>> {
  try {
    if (!validId(id)) return { ok: false, error: 'IDが不正です' }
    const actor = await requireCrmRelations({ company_id: id })
    const data: Partial<Pick<Company, CompanyGridEditableField>> = {}
    if (field === 'name') data.name = requiredText(value, '会社名')
    else if (field === 'industry') data.industry = optionalText(value)
    else if (field === 'phone') data.phone = optionalText(value)
    else if (field === 'status') data.status = selectValue(value, ['active', 'inactive'] as const)
    else return { ok: false, error: '項目が不正です' }
    const updated = await updateCompany(id, data)
    if (!updated) return { ok: false, error: '対象が見つかりません' }
    await recordCrmActor(actor.id, 'update', 'company', id)
    revalidatePath('/companies'); revalidatePath(`/companies/${id}`)
    return { ok: true, data: updated }
  } catch (error) { return fail(error) }
}

export async function updateDealGridCellAction(id: string, field: DealGridEditableField, value: unknown): Promise<GridActionResult<Deal>> {
  try {
    await requireDealAccess(id, true)
    if (!validId(id)) return { ok: false, error: 'IDが不正です' }
    const data: Partial<Pick<Deal, DealGridEditableField>> = {}
    if (field === 'title') data.title = requiredText(value, '案件名')
    else if (field === 'amount') data.amount = numberValue(value, '案件金額', 0)
    else if (field === 'probability') data.probability = numberValue(value, '受注確度', 0, 100)
    else if (field === 'expected_close_date') data.expected_close_date = optionalDate(value)
    else if (field === 'status') data.status = selectValue(value, ['open', 'won', 'lost'] as const)
    else return { ok: false, error: '項目が不正です' }
    const updated = await updateDealGridFields(id, data)
    if (!updated) return { ok: false, error: '対象が見つかりません' }
    revalidatePath('/deals'); revalidatePath(`/deals/${id}`)
    return { ok: true, data: updated }
  } catch (error) { return fail(error) }
}

export async function updateContactGridCellAction(id: string, field: ContactGridEditableField, value: unknown): Promise<GridActionResult<Contact>> {
  try {
    if (!validId(id)) return { ok: false, error: 'IDが不正です' }
    const actor = await requireContactWrite(id)
    const data: Partial<Pick<Contact, ContactGridEditableField>> = {}
    if (field === 'name') data.name = requiredText(value, '氏名')
    else if (field === 'department') data.department = optionalText(value)
    else if (field === 'position') data.position = optionalText(value)
    else if (field === 'email') data.email = optionalEmail(value)
    else if (field === 'phone') data.phone = optionalText(value)
    else if (field === 'is_decision_maker') data.is_decision_maker = checkboxValue(value)
    else return { ok: false, error: '項目が不正です' }
    const updated = await updateContactGridFields(id, data)
    if (!updated) return { ok: false, error: '対象が見つかりません' }
    await recordCrmActor(actor.id, 'update', 'contact', id)
    revalidatePath('/contacts'); revalidatePath(`/contacts/${id}/edit`)
    return { ok: true, data: updated }
  } catch (error) { return fail(error) }
}

export async function updateTaskGridCellAction(id: string, field: TaskGridEditableField, value: unknown): Promise<GridActionResult<Task>> {
  try {
    const { task } = await requireTaskWrite(id)
    if (!Object.hasOwn(taskFieldsSchema.shape, field)) return { ok: false, error: '項目が不正です' }
    const parsed = taskFieldsSchema.shape[field].safeParse(value)
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
    const updated = await updateTaskGridFields(id, { [field]: parsed.data })
    if (!updated) return { ok: false, error: '課題が見つかりません' }
    revalidatePath('/tasks'); revalidatePath('/dashboard'); revalidatePath(`/tasks/${id}/edit`)
    if (task.company_id) revalidatePath(`/companies/${task.company_id}`)
    if (task.deal_id) revalidatePath(`/deals/${task.deal_id}`)
    return { ok: true, data: updated }
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') return { ok: false, error: 'この顧客では同じNoが使われています' }
    return fail(error)
  }
}
