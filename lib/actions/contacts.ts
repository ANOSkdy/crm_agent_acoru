'use server'

import { redirect } from 'next/navigation'
import { createContact, deleteContact } from '@/lib/db/queries/contacts'
import { createContactSchema } from '@/lib/validation/contact'

export async function createContactAction(formData: FormData): Promise<void> {
  const raw = {
    ...Object.fromEntries(formData.entries()),
    is_decision_maker: formData.get('is_decision_maker') === 'true',
  }
  const parsed = createContactSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('Validation error:', parsed.error.issues[0].message)
    return
  }
  await createContact(parsed.data)
  redirect(`/companies/${parsed.data.company_id}`)
}

export async function deleteContactAction(id: string, companyId: string): Promise<void> {
  await deleteContact(id)
  redirect(`/companies/${companyId}`)
}
