'use server'

import { redirect } from 'next/navigation'
import { createDeal, updateDeal, deleteDeal } from '@/lib/db/queries/deals'
import { createDealSchema, updateDealSchema } from '@/lib/validation/deal'

export async function createDealAction(formData: FormData): Promise<void> {
  const raw = Object.fromEntries(formData.entries())
  const parsed = createDealSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('Validation error:', parsed.error.issues[0].message)
    return
  }
  const deal = await createDeal(parsed.data)
  redirect(`/deals/${deal.id}`)
}

export async function updateDealAction(id: string, formData: FormData): Promise<void> {
  const redirectTo = formData.get('redirectTo')?.toString()
  const raw = Object.fromEntries(formData.entries())
  delete (raw as Record<string, unknown>).redirectTo
  const parsed = updateDealSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('Validation error:', parsed.error.issues[0].message)
    return
  }
  await updateDeal(id, parsed.data)
  redirect(redirectTo || `/deals/${id}`)
}

export async function deleteDealAction(id: string, companyId?: string): Promise<void> {
  await deleteDeal(id)
  redirect(companyId ? `/companies/${companyId}` : '/deals')
}
