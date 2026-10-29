'use server'

import { redirect } from 'next/navigation'
import { requireCrmWrite, requireCrmRelations, recordCrmActor } from '@/lib/auth/crm-permissions'
import { createCompany, updateCompany, deleteCompany } from '@/lib/db/queries/companies'
import { createCompanySchema, updateCompanySchema } from '@/lib/validation/company'

export async function createCompanyAction(formData: FormData): Promise<void> {
  const actor = await requireCrmWrite()
  const raw = Object.fromEntries(formData.entries())
  const parsed = createCompanySchema.safeParse(raw)
  if (!parsed.success) {
    // In a real app, use useActionState to surface errors; for MVP redirect to list
    console.error('Validation error:', parsed.error.issues[0].message)
    return
  }
  const company = await createCompany({ ...parsed.data, created_by: actor.id })
  redirect(`/companies/${company.id}`)
}

export async function updateCompanyAction(id: string, formData: FormData): Promise<void> {
  const actor = await requireCrmWrite()
  const raw = Object.fromEntries(formData.entries())
  const parsed = updateCompanySchema.safeParse(raw)
  if (!parsed.success) {
    console.error('Validation error:', parsed.error.issues[0].message)
    return
  }
  await requireCrmRelations({ company_id: id })
  await updateCompany(id, parsed.data)
  await recordCrmActor(actor.id, 'update', 'company', id)
  redirect(`/companies/${id}`)
}

export async function deleteCompanyAction(id: string): Promise<void> {
  const actor = await requireCrmWrite(true)
  await requireCrmRelations({ company_id: id })
  await deleteCompany(id)
  await recordCrmActor(actor.id, 'delete', 'company', id)
  redirect('/companies')
}
