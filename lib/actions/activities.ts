'use server'

import { redirect } from 'next/navigation'
import { createActivity, deleteActivity } from '@/lib/db/queries/activities'
import { createActivitySchema } from '@/lib/validation/activity'

export async function createActivityAction(formData: FormData): Promise<void> {
  const raw = Object.fromEntries(formData.entries())
  const parsed = createActivitySchema.safeParse(raw)
  if (!parsed.success) {
    console.error('Validation error:', parsed.error.issues[0].message)
    return
  }
  await createActivity(parsed.data)
  redirect(`/companies/${parsed.data.company_id}`)
}

export async function deleteActivityAction(id: string, companyId: string): Promise<void> {
  await deleteActivity(id)
  redirect(`/companies/${companyId}`)
}
