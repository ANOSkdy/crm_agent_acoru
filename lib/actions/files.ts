'use server'

import { redirect } from 'next/navigation'
import { createFile, deleteFile } from '@/lib/db/queries/files'
import { createFileSchema } from '@/lib/validation/file'

export async function createFileAction(formData: FormData): Promise<void> {
  const raw = Object.fromEntries(formData.entries())
  const parsed = createFileSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('Validation error:', parsed.error.issues[0].message)
    return
  }
  await createFile(parsed.data)
  const companyId = parsed.data.company_id
  if (companyId) {
    redirect(`/companies/${companyId}`)
  } else {
    redirect('/files')
  }
}

export async function deleteFileAction(id: string): Promise<void> {
  await deleteFile(id)
}
