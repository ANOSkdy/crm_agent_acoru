'use server'

import { redirect } from 'next/navigation'
import { createTask, updateTask, completeTask, deleteTask } from '@/lib/db/queries/tasks'
import { createTaskSchema, updateTaskSchema } from '@/lib/validation/task'
import { requireApiUser, requireDealAccess, requireTaskWrite } from '@/lib/auth/deal-permissions'
import { AgentError } from '@/lib/agent/errors'

async function checkTarget(data: { deal_id?: string; company_id?: string }) {
  const user = await requireApiUser()
  if (user.role === 'viewer') throw new AgentError(403, '更新権限がありません')
  if (data.deal_id) {
    const { deal } = await requireDealAccess(data.deal_id, true)
    if (data.company_id && data.company_id !== deal.company_id) throw new AgentError(400, '案件と顧客が一致しません')
  }
  return user
}

export async function createTaskAction(formData: FormData): Promise<void> {
  const raw = Object.fromEntries(formData.entries())
  const parsed = createTaskSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('Validation error:', parsed.error.issues[0].message)
    return
  }
  const user = await checkTarget(parsed.data)
  await createTask({ ...parsed.data, assigned_to: user.id })
  const companyId = parsed.data.company_id
  if (companyId) redirect(`/companies/${companyId}`)
  redirect('/tasks')
}

export async function updateTaskAction(id: string, formData: FormData): Promise<void> {
  await requireTaskWrite(id)
  const redirectTo = formData.get('redirectTo')?.toString()
  const raw = Object.fromEntries(formData.entries())
  delete raw.redirectTo
  const parsed = updateTaskSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('Validation error:', parsed.error.issues[0].message)
    return
  }
  await checkTarget(parsed.data)
  await updateTask(id, parsed.data)
  redirect(redirectTo || (parsed.data.company_id ? `/companies/${parsed.data.company_id}` : '/tasks'))
}

export async function completeTaskAction(id: string): Promise<void> {
  await requireTaskWrite(id)
  await completeTask(id)
}

export async function deleteTaskAction(id: string, companyId?: string): Promise<void> {
  await requireTaskWrite(id)
  await deleteTask(id)
  redirect(companyId ? `/companies/${companyId}` : '/tasks')
}
