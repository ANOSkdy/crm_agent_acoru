export const dynamic = 'force-dynamic'

import { getContacts } from '@/lib/db/queries/contacts'
import { getCompanies } from '@/lib/db/queries/companies'
import { requireApiUser } from '@/lib/auth/deal-permissions'
import { ContactsGrid } from '@/components/grid/ContactsGrid'

export default async function ContactsPage() {
  const [contacts, companies, user] = await Promise.all([getContacts(), getCompanies(), requireApiUser()])

  return (
    <div className="workspace">
      <ContactsGrid contacts={contacts} companies={companies.map((c) => ({ id: c.id, name: c.name }))} canWrite={user.role !== 'viewer'} />
    </div>
  )
}
