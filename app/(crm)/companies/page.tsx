export const dynamic = 'force-dynamic'

import { getCompanies } from '@/lib/db/queries/companies'
import { requireApiUser } from '@/lib/auth/deal-permissions'
import { CompaniesGrid } from '@/components/grid/CompaniesGrid'

interface Props {
  searchParams: Promise<{ search?: string; status?: string }>
}

export default async function CompaniesPage({ searchParams }: Props) {
  const [params, companies, user] = await Promise.all([searchParams, getCompanies(), requireApiUser()])

  return (
    <div className="workspace">
      <CompaniesGrid
        companies={companies}
        canWrite={user.role !== 'viewer'}
        initialQuery={params.search}
        initialFilters={params.status ? { status: params.status } : undefined}
        actions={<a href="/api/export/companies" className="btn btn--sm">CSVエクスポート</a>}
      />
    </div>
  )
}
