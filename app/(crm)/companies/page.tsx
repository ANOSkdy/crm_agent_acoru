export const dynamic = 'force-dynamic'

import { getCompanies } from '@/lib/db/queries/companies'
import Link from 'next/link'
import { CompaniesGrid } from '@/components/grid/CompaniesGrid'

interface Props {
  searchParams: Promise<{ search?: string; status?: string }>
}

export default async function CompaniesPage({ searchParams }: Props) {
  const params = await searchParams
  const companies = await getCompanies()

  return (
    <div className="workspace">
      <CompaniesGrid
        companies={companies}
        initialQuery={params.search}
        initialFilters={params.status ? { status: params.status } : undefined}
        actions={<>
          <a href="/api/export/companies" className="btn btn--sm">CSVエクスポート</a>
          <Link href="/companies/new" className="btn btn--sm btn--primary">+ 新規顧客</Link>
        </>}
      />
    </div>
  )
}
