export const dynamic = 'force-dynamic'
import { SourceLinks } from '@/components/raw/SourceLinks'

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getDealById, getDealStages } from '@/lib/db/queries/deals'
import { getTasks } from '@/lib/db/queries/tasks'
import { canEditDeal, requireApiUser } from '@/lib/auth/deal-permissions'
import { DealProperties } from '@/components/grid/RecordProperties'
import { formatDisplayDate, toDateInputValue } from '@/lib/utils/date'

interface Props {
  params: Promise<{ dealId: string }>
}

export default async function DealDetailPage({ params }: Props) {
  const { dealId } = await params
  const [deal, tasks, stages, user] = await Promise.all([
    getDealById(dealId),
    getTasks({ dealId }),
    getDealStages(),
    requireApiUser(),
  ])

  if (!deal) notFound()

  const today = toDateInputValue(new Date())

  return (
    <div className="workspace">
      <div className="workspace__bar">
        <Link href="/deals" className="workspace__back">案件</Link>
        <h1 className="workspace__title">{deal.title}</h1>
        <Link href={`/companies/${deal.company_id}`} className="crm-grid__link">{deal.company_name}</Link>
      </div>
      <div className="workspace__body workspace__body--padded">
        <div className="record-layout">
          <section className="panel">
            <div className="panel__head"><h2 className="panel__title">案件情報</h2>{canEditDeal(user, deal) && <span className="panel__hint">項目をクリックして編集</span>}</div>
            <DealProperties deal={deal} stages={stages.map((s) => ({ id: s.id, name: s.name }))} canEdit={canEditDeal(user, deal)} />
          </section>

          <SourceLinks dealId={dealId}/>

          <section className="panel">
            <div className="panel__head"><h2 className="panel__title">課題</h2><span className="workspace__spacer" /><Link href={`/tasks?company=${deal.company_id}`} className="crm-grid__link">課題管理で編集</Link></div>
            {tasks.length === 0 ? (
              <p className="panel__body record-muted">課題がありません</p>
            ) : (
              <table className="data-table">
                <thead><tr><th>No</th><th>内容</th><th>期限</th><th>状態</th></tr></thead>
                <tbody>
                  {tasks.map((t) => {
                    const overdue = !!t.due_date && ['open', 'in_progress'].includes(t.status) && t.due_date.slice(0, 10) < today
                    return (
                      <tr key={t.id} id={`task-${t.id}`} className={overdue ? 'crm-grid__row--overdue' : undefined}>
                        <td className="num">{t.issue_number}</td>
                        <td className={t.status === 'done' ? 'crm-grid__text-done' : undefined}>{t.title}</td>
                        <td>{formatDisplayDate(t.due_date)}{overdue && <span className="crm-grid__overdue-note">期限超過</span>}</td>
                        <td>{({ open: '未着手', in_progress: '対応中', done: '完了', not_needed: '不要' } as const)[t.status]}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
