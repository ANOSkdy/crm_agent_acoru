import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { getContactById } from '@/lib/db/queries/contacts'

// Contacts are edited in the grid; this route remains for old links.
export default async function EditContactPage({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params
  if (!z.uuid().safeParse(contactId).success) notFound()
  const contact = await getContactById(contactId)
  if (!contact) notFound()
  redirect(`/companies/${contact.company_id}`)
}
