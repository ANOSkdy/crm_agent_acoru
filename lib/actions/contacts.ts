'use server'

import { redirect } from 'next/navigation'
import { requireCrmWrite, requireCrmRelations, requireContactWrite, recordCrmActor } from '@/lib/auth/crm-permissions'
import { createContact, updateContact, deleteContact } from '@/lib/db/queries/contacts'
import { createContactSchema, updateContactSchema } from '@/lib/validation/contact'

export async function createContactAction(formData: FormData): Promise<void> {
  const actor = await requireCrmWrite()
  const raw = {
    ...Object.fromEntries(formData.entries()),
    is_decision_maker: formData.get('is_decision_maker') === 'true',
  }
  const parsed = createContactSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('Validation error:', parsed.error.issues[0].message)
    return
  }
  await requireCrmRelations(parsed.data)
  await createContact({ ...parsed.data, created_by: actor.id })
  redirect(`/companies/${parsed.data.company_id}`)
}

export async function updateContactAction(id: string, formData: FormData): Promise<void> {
  const redirectTo = formData.get('redirectTo')?.toString()
  const actor = await requireCrmWrite()
  const raw = {
    ...Object.fromEntries(formData.entries()),
    is_decision_maker: formData.get('is_decision_maker') === 'true',
  }
  delete (raw as Record<string, unknown>).redirectTo
  const parsed = updateContactSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('Validation error:', parsed.error.issues[0].message)
    return
  }
  await requireContactWrite(id, parsed.data.company_id)
  await updateContact(id, parsed.data)
  await recordCrmActor(actor.id, 'update', 'contact', id)
  redirect(redirectTo || `/companies/${parsed.data.company_id}`)
}

export async function deleteContactAction(id: string, companyId?: string): Promise<void> {
  const actor = await requireContactWrite(id, companyId, true)
  await deleteContact(id)
  await recordCrmActor(actor.id, 'delete', 'contact', id)
  redirect(companyId ? `/companies/${companyId}` : '/contacts')
}
