'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { addTaskTab, createTask, updateTask, deleteTask, type Task } from '@/lib/db/queries/tasks'
import { createTaskSchema, updateTaskSchema } from '@/lib/validation/task'
import { requireTaskWrite } from '@/lib/auth/deal-permissions'
import { requireCrmRelations, requireCrmWrite } from '@/lib/auth/crm-permissions'
import { AppError } from '@/lib/http/errors'
export type TaskActionState = { error?: string }
function actionError(error: unknown): TaskActionState {
  if (error instanceof AppError) return { error: error.message }
  if (error instanceof z.ZodError) return { error: error.issues[0].message }
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') return { error: 'この顧客では同じNoが使われています' }
  return { error: '保存できませんでした。入力内容と接続を確認してください' }
}
function refreshTask(task: Pick<Task, 'id' | 'company_id' | 'deal_id'>) {
  revalidatePath('/tasks')
  revalidatePath('/dashboard')
  revalidatePath(`/tasks/${task.id}/edit`)
  if (task.company_id) revalidatePath(`/companies/${task.company_id}`)
  if (task.deal_id) revalidatePath(`/deals/${task.deal_id}`)
}
export async function addTaskTabAction(_state: TaskActionState, formData: FormData): Promise<TaskActionState> {
  let companyId: string
  try {
    await requireCrmWrite()
    companyId = z.uuid('顧客を選択してください').parse(formData.get('company_id'))
    const user = await requireCrmRelations({ company_id: companyId })
    await addTaskTab(companyId, user.id)
    revalidatePath('/tasks')
  } catch (error) { return actionError(error) }
  redirect(`/tasks?company=${companyId}`)
}
export async function createTaskAction(_state: TaskActionState, formData: FormData): Promise<TaskActionState> {
  let task: Task
  try {
    await requireCrmWrite()
    const data = createTaskSchema.parse(Object.fromEntries(formData.entries()))
    const user = await requireCrmRelations(data)
    task = await createTask({ ...data, assigned_to: user.id, created_by: user.id })
    refreshTask(task)
  } catch (error) { return actionError(error) }
  redirect(`/tasks?company=${task.company_id}`)
}
export async function updateTaskAction(id: string, _state: TaskActionState, formData: FormData): Promise<TaskActionState> {
  let updated: Task
  try {
    const { task } = await requireTaskWrite(id)
    const data = updateTaskSchema.parse(Object.fromEntries(formData.entries()))
    if (task.deal_id && !data.company_id) throw new AppError(400, '案件に紐づく課題は顧客を指定してください')
    await requireCrmRelations({ company_id: data.company_id, deal_id: task.deal_id ?? undefined })
    const result = await updateTask(id, data)
    if (!result) throw new AppError(404, '課題が見つかりません')
    updated = result
    refreshTask(task)
    refreshTask(updated)
  } catch (error) { return actionError(error) }
  redirect(`/tasks?company=${updated.company_id ?? 'unassigned'}`)
}
export async function deleteTaskAction(id: string): Promise<TaskActionState> {
  try {
    const { task } = await requireTaskWrite(id)
    await deleteTask(id)
    refreshTask(task)
  } catch (error) { return actionError(error) }
  return {}
}
