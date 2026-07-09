export const dynamic = 'force-dynamic'

import { getContacts } from '@/lib/db/queries/contacts'
import { ContactsGrid } from '@/components/grid/ContactsGrid'

export default async function ContactsPage() {
  const contacts = await getContacts()

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">担当者一覧</h1>
      <ContactsGrid contacts={contacts} />

    </div>
  )
}
