'use server'

import { redirect } from 'next/navigation'
import { createActivity, updateActivity, deleteActivity, getActivityById } from '@/lib/db/queries/activities'
import { createActivitySchema, updateActivitySchema } from '@/lib/validation/activity'
import { requireApiUser, requireDealAccess } from '@/lib/auth/deal-permissions'
import { AgentError } from '@/lib/agent/errors'

async function checkTarget(data: { deal_id?: string | null; company_id: string }) {
  const user = await requireApiUser()
  if (user.role === 'viewer') throw new AgentError(403, '更新権限がありません')
  if (data.deal_id) {
    const { deal } = await requireDealAccess(data.deal_id, true)
    if (deal.company_id !== data.company_id) throw new AgentError(400, '案件と顧客が一致しません')
  }
}
async function checkExisting(id: string) {
  const activity = await getActivityById(id)
  if (!activity) throw new AgentError(404, '活動が見つかりません')
  await checkTarget(activity)
}

export async function createActivityAction(formData: FormData): Promise<void> {
  const raw = Object.fromEntries(formData.entries())
  const parsed = createActivitySchema.safeParse(raw)
  if (!parsed.success) {
    console.error('Validation error:', parsed.error.issues[0].message)
    return
  }
  await checkTarget(parsed.data)
  await createActivity(parsed.data)
  redirect(`/companies/${parsed.data.company_id}`)
}

export async function updateActivityAction(id: string, formData: FormData): Promise<void> {
  await requireApiUser()
  await checkExisting(id)
  const redirectTo = formData.get('redirectTo')?.toString()
  const raw = Object.fromEntries(formData.entries())
  delete raw.redirectTo
  const parsed = updateActivitySchema.safeParse(raw)
  if (!parsed.success) {
    console.error('Validation error:', parsed.error.issues[0].message)
    return
  }
  await checkTarget(parsed.data)
  await updateActivity(id, parsed.data)
  redirect(redirectTo || `/companies/${parsed.data.company_id}`)
}

export async function deleteActivityAction(id: string, companyId?: string): Promise<void> {
  await requireApiUser()
  await checkExisting(id)
  await deleteActivity(id)
  redirect(companyId ? `/companies/${companyId}` : '/activities')
}
