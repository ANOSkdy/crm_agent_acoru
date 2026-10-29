export const dynamic = 'force-dynamic'

import { getContacts } from '@/lib/db/queries/contacts'
import { ContactsGrid } from '@/components/grid/ContactsGrid'

export default async function ContactsPage() {
  const contacts = await getContacts()

  return (
    <div className="workspace">
      <ContactsGrid contacts={contacts} />
    </div>
  )
}
