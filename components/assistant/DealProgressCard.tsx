import Link from 'next/link'
import { getDealProgress } from '@/lib/db/queries/crm-search'
import { healthLabels, type Health } from '@/lib/agent/schema'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'

export async function DealProgressCard({dealId}:{dealId:string}) {
  const {context,decisions}=await getDealProgress(dealId)
  return <Card>
    <CardHeader><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">進捗・方針</h2><Link href={`/assistant?deal=${dealId}`} className="btn btn--secondary">AIに相談する ↗</Link></div></CardHeader>
    <CardBody>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div><dt className="text-gray-500">現在の状況</dt><dd>{String(context?.current_summary||'未記録')}</dd></div>
        <div><dt className="text-gray-500">進行状況</dt><dd>{healthLabels[(context?.health||'unknown') as Health]}</dd></div>
        <div><dt className="text-gray-500">採用した方針</dt><dd>{String(context?.current_strategy||'未記録')}</dd></div>
        <div><dt className="text-gray-500">懸念・障害</dt><dd>{String(context?.blockers||'未記録')}</dd></div>
      </dl>
      {decisions.length>0 && <details className="mt-4"><summary className="text-sm cursor-pointer text-gray-500">方針の履歴</summary><ol className="agent-decisions">{decisions.map(d=><li key={String(d.id)} id={`decision-${d.id}`}><strong>{String(d.content)}</strong><p>{String(d.rationale)}</p></li>)}</ol></details>}
    </CardBody>
  </Card>
}
