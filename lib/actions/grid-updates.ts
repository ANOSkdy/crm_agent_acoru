'use server'

import { revalidatePath } from 'next/cache'
import { createTaskSchema, taskFieldsSchema } from '@/lib/validation/task'
import { createCompanySchema } from '@/lib/validation/company'
import { createContactSchema } from '@/lib/validation/contact'
import { createDealSchema } from '@/lib/validation/deal'
import { requireCrmRelations, requireCrmWrite, requireContactWrite, recordCrmActor } from '@/lib/auth/crm-permissions'
import { AppError } from '@/lib/http/errors'
import { createCompany, updateCompany, type Company } from '@/lib/db/queries/companies'
import { createDeal, getDealById, updateDealGridFields, type Deal } from '@/lib/db/queries/deals'
import { createContact, getContactById, updateContactGridFields, type Contact } from '@/lib/db/queries/contacts'
import { createTask, getTaskById, updateTaskGridFields, type Task } from '@/lib/db/queries/tasks'
import { requireApiUser, requireDealAccess, requireTaskWrite } from '@/lib/auth/deal-permissions'
import { z } from 'zod'

export type GridActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

export type CompanyGridEditableField = 'name' | 'corporate_number' | 'industry' | 'website_url' | 'postal_code' | 'address' | 'phone' | 'status' | 'source' | 'memo'
export type DealGridEditableField = 'title' | 'amount' | 'stage_id' | 'probability' | 'expected_close_date' | 'status' | 'memo'
export type ContactGridEditableField = 'name' | 'department' | 'position' | 'email' | 'phone' | 'is_decision_maker' | 'memo'
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
function optionalUrl(value: unknown) {
  const text = optionalText(value)
  if (text !== null && !z.url().safeParse(text).success) throw new AppError(400, 'URLの形式が正しくありません')
  return text
}
function fail(error: unknown): GridActionResult<never> {
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0].message }
  return { ok: false, error: error instanceof AppError ? error.message : '更新できませんでした。入力内容と権限を確認してください' }
}
// Grid cells send '' for empty inputs; drop blanks so schema defaults apply.
function formValues(values: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(values)
    .filter(([, value]) => value != null && String(value).trim() !== '')
    .map(([key, value]) => [key, typeof value === 'boolean' ? value : String(value).trim()]))
}

export async function updateCompanyGridCellAction(id: string, field: CompanyGridEditableField, value: unknown): Promise<GridActionResult<Company>> {
  try {
    if (!validId(id)) return { ok: false, error: 'IDが不正です' }
    const actor = await requireCrmRelations({ company_id: id })
    const data: Partial<Pick<Company, CompanyGridEditableField>> = {}
    if (field === 'name') data.name = requiredText(value, '会社名')
    else if (field === 'corporate_number') {
      const text = optionalText(value)
      if (text !== null && !/^[0-9]{13}$/.test(text)) throw new AppError(400, '法人番号は13桁の数字で入力してください')
      data.corporate_number = text
    }
    else if (field === 'industry') data.industry = optionalText(value)
    else if (field === 'website_url') data.website_url = optionalUrl(value)
    else if (field === 'postal_code') data.postal_code = optionalText(value)
    else if (field === 'address') data.address = optionalText(value)
    else if (field === 'phone') data.phone = optionalText(value)
    else if (field === 'status') data.status = selectValue(value, ['active', 'inactive'] as const)
    else if (field === 'source') data.source = optionalText(value)
    else if (field === 'memo') data.memo = optionalText(value)
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
    else if (field === 'stage_id') data.stage_id = optionalText(value) === null ? null : z.uuid('営業ステージが不正です').parse(String(value).trim())
    else if (field === 'probability') data.probability = numberValue(value, '受注確度', 0, 100)
    else if (field === 'expected_close_date') data.expected_close_date = optionalDate(value)
    else if (field === 'status') data.status = selectValue(value, ['open', 'won', 'lost'] as const)
    else if (field === 'memo') data.memo = optionalText(value)
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
    else if (field === 'memo') data.memo = optionalText(value)
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

export async function createCompanyGridRowAction(values: Record<string, unknown>): Promise<GridActionResult<Company>> {
  try {
    const actor = await requireCrmWrite()
    const data = createCompanySchema.parse(formValues(values))
    const created = await createCompany({ ...data, created_by: actor.id })
    await recordCrmActor(actor.id, 'create', 'company', created.id)
    revalidatePath('/companies')
    return { ok: true, data: created }
  } catch (error) { return fail(error) }
}

export async function createContactGridRowAction(values: Record<string, unknown>): Promise<GridActionResult<Contact>> {
  try {
    const actor = await requireCrmWrite()
    const data = createContactSchema.parse({ ...formValues(values), is_decision_maker: checkboxValue(values.is_decision_maker ?? false) })
    await requireCrmRelations({ company_id: data.company_id })
    const created = await createContact({ ...data, created_by: actor.id })
    await recordCrmActor(actor.id, 'create', 'contact', created.id)
    revalidatePath('/contacts'); revalidatePath(`/companies/${data.company_id}`)
    return { ok: true, data: (await getContactById(created.id)) ?? created }
  } catch (error) { return fail(error) }
}

export async function createDealGridRowAction(values: Record<string, unknown>): Promise<GridActionResult<Deal>> {
  try {
    const user = await requireApiUser()
    if (user.role === 'viewer') throw new AppError(403, '作成権限がありません')
    const data = createDealSchema.parse(formValues(values))
    await requireCrmRelations({ company_id: data.company_id })
    const created = await createDeal({ ...data, owner_user_id: user.id, created_by: user.id })
    revalidatePath('/deals'); revalidatePath('/dashboard'); revalidatePath(`/companies/${data.company_id}`)
    return { ok: true, data: (await getDealById(created.id)) ?? created }
  } catch (error) { return fail(error) }
}

export async function createTaskGridRowAction(values: Record<string, unknown>): Promise<GridActionResult<Task>> {
  try {
    await requireCrmWrite()
    const data = createTaskSchema.parse(formValues(values))
    const user = await requireCrmRelations(data)
    const created = await createTask({ ...data, assigned_to: user.id, created_by: user.id })
    revalidatePath('/tasks'); revalidatePath('/dashboard'); revalidatePath(`/companies/${data.company_id}`)
    return { ok: true, data: (await getTaskById(created.id)) ?? created }
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') return { ok: false, error: 'この顧客では同じNoが使われています' }
    return fail(error)
  }
}
