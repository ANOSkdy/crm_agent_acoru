'use server'

import { redirect } from 'next/navigation'
import { createFile, updateFile, deleteFile } from '@/lib/db/queries/files'
import { createFileSchema, updateFileSchema } from '@/lib/validation/file'

export async function createFileAction(formData: FormData): Promise<void> {
  const raw = Object.fromEntries(formData.entries())
  const parsed = createFileSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('Validation error:', parsed.error.issues[0].message)
    return
  }
  await createFile(parsed.data)
  const companyId = parsed.data.company_id
  if (companyId) redirect(`/companies/${companyId}`)
  redirect('/files')
}

export async function updateFileAction(id: string, formData: FormData): Promise<void> {
  const redirectTo = formData.get('redirectTo')?.toString()
  const raw = Object.fromEntries(formData.entries())
  delete raw.redirectTo
  const parsed = updateFileSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('Validation error:', parsed.error.issues[0].message)
    return
  }
  await updateFile(id, parsed.data)
  redirect(redirectTo || (parsed.data.company_id ? `/companies/${parsed.data.company_id}` : '/files'))
}

export async function deleteFileAction(id: string, companyId?: string): Promise<void> {
  await deleteFile(id)
  redirect(companyId ? `/companies/${companyId}` : '/files')
}
