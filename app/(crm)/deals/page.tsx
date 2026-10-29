export const dynamic = 'force-dynamic'

import { getDeals, getDealStages } from '@/lib/db/queries/deals'
import { DealsGrid } from '@/components/grid/DealsGrid'

interface Props {
  searchParams: Promise<{ stageId?: string; status?: string }>
}

export default async function DealsPage({ searchParams }: Props) {
  const params = await searchParams
  const [deals, stages] = await Promise.all([getDeals(), getDealStages()])
  const stageName = stages.find((s) => s.id === params.stageId)?.name

  return (
    <div className="workspace">
      <DealsGrid
        deals={deals}
        initialFilters={{ ...(stageName ? { stage: stageName } : {}), ...(params.status ? { status: params.status } : {}) }}
        actions={<a href="/api/export/deals" className="btn btn--sm">CSVエクスポート</a>}
      />
    </div>
  )
}
