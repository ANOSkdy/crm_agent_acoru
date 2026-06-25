'use server'

import { redirect } from 'next/navigation'
import { createTask, updateTask, completeTask, deleteTask } from '@/lib/db/queries/tasks'
import { createTaskSchema, updateTaskSchema } from '@/lib/validation/task'

export async function createTaskAction(formData: FormData): Promise<void> {
  const raw = Object.fromEntries(formData.entries())
  const parsed = createTaskSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('Validation error:', parsed.error.issues[0].message)
    return
  }
  await createTask(parsed.data)
  const companyId = parsed.data.company_id
  if (companyId) redirect(`/companies/${companyId}`)
  redirect('/tasks')
}

export async function updateTaskAction(id: string, formData: FormData): Promise<void> {
  const redirectTo = formData.get('redirectTo')?.toString()
  const raw = Object.fromEntries(formData.entries())
  delete raw.redirectTo
  const parsed = updateTaskSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('Validation error:', parsed.error.issues[0].message)
    return
  }
  await updateTask(id, parsed.data)
  redirect(redirectTo || (parsed.data.company_id ? `/companies/${parsed.data.company_id}` : '/tasks'))
}

export async function completeTaskAction(id: string): Promise<void> {
  await completeTask(id)
}

export async function deleteTaskAction(id: string, companyId?: string): Promise<void> {
  await deleteTask(id)
  redirect(companyId ? `/companies/${companyId}` : '/tasks')
}
