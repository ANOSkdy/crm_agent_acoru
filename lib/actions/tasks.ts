'use server'

import { redirect } from 'next/navigation'
import { createTask, completeTask, deleteTask } from '@/lib/db/queries/tasks'
import { createTaskSchema } from '@/lib/validation/task'

export async function createTaskAction(formData: FormData): Promise<void> {
  const raw = Object.fromEntries(formData.entries())
  const parsed = createTaskSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('Validation error:', parsed.error.issues[0].message)
    return
  }
  await createTask(parsed.data)
  const companyId = parsed.data.company_id
  if (companyId) {
    redirect(`/companies/${companyId}`)
  } else {
    redirect('/tasks')
  }
}

export async function completeTaskAction(id: string): Promise<void> {
  await completeTask(id)
}

export async function deleteTaskAction(id: string): Promise<void> {
  await deleteTask(id)
}
