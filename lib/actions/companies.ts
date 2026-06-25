'use server'

import { redirect } from 'next/navigation'
import { createCompany, updateCompany, deleteCompany } from '@/lib/db/queries/companies'
import { createCompanySchema, updateCompanySchema } from '@/lib/validation/company'

export async function createCompanyAction(formData: FormData): Promise<void> {
  const raw = Object.fromEntries(formData.entries())
  const parsed = createCompanySchema.safeParse(raw)
  if (!parsed.success) {
    // In a real app, use useActionState to surface errors; for MVP redirect to list
    console.error('Validation error:', parsed.error.issues[0].message)
    return
  }
  const company = await createCompany(parsed.data)
  redirect(`/companies/${company.id}`)
}

export async function updateCompanyAction(id: string, formData: FormData): Promise<void> {
  const raw = Object.fromEntries(formData.entries())
  const parsed = updateCompanySchema.safeParse(raw)
  if (!parsed.success) {
    console.error('Validation error:', parsed.error.issues[0].message)
    return
  }
  await updateCompany(id, parsed.data)
  redirect(`/companies/${id}`)
}

export async function deleteCompanyAction(id: string): Promise<void> {
  await deleteCompany(id)
  redirect('/companies')
}
