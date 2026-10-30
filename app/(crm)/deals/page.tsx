export const dynamic = 'force-dynamic'

import { getDeals, getDealStages } from '@/lib/db/queries/deals'
import { getCompanies } from '@/lib/db/queries/companies'
import { requireApiUser } from '@/lib/auth/deal-permissions'
import { DealsGrid } from '@/components/grid/DealsGrid'

interface Props {
  searchParams: Promise<{ stageId?: string; status?: string }>
}

export default async function DealsPage({ searchParams }: Props) {
  const [params, deals, stages, companies, user] = await Promise.all([searchParams, getDeals(), getDealStages(), getCompanies(), requireApiUser()])

  return (
    <div className="workspace">
      <DealsGrid
        deals={deals}
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        stages={stages.map((s) => ({ id: s.id, name: s.name }))}
        canWrite={user.role !== 'viewer'}
        ownerOnlyUserId={user.role === 'admin' ? undefined : user.id}
        initialFilters={{ ...(params.stageId ? { stage_id: params.stageId } : {}), ...(params.status ? { status: params.status } : {}) }}
        actions={<a href="/api/export/deals" className="btn btn--sm">CSVエクスポート</a>}
      />
    </div>
  )
}
