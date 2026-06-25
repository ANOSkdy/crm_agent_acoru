export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getDealById } from '@/lib/db/queries/deals'
import { getActivities } from '@/lib/db/queries/activities'
import { getTasks } from '@/lib/db/queries/tasks'
import { getFiles } from '@/lib/db/queries/files'
import { Badge, stageBadgeVariant } from '@/components/ui/Badge'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import Link from 'next/link'
import { formatDisplayDate } from '@/lib/utils/date'

const formatDate = formatDisplayDate

interface Props {
  params: Promise<{ dealId: string }>
}

export default async function DealDetailPage({ params }: Props) {
  const { dealId } = await params
  const [deal, activities, tasks, files] = await Promise.all([
    getDealById(dealId),
    getActivities({ dealId }),
    getTasks({ dealId }),
    getFiles({ dealId }),
  ])

  if (!deal) notFound()

  const now = new Date()

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{deal.title}</h1>
          <p className="text-sm text-gray-500 mt-1">
            <Link href={`/companies/${deal.company_id}`} className="text-blue-600 hover:underline">{deal.company_name}</Link>
          </p>
        </div>
        <Badge variant={stageBadgeVariant(deal.stage_name)}>{deal.stage_name ?? 'ステージ未設定'}</Badge>
      </div>

      <Card>
        <CardHeader><h2 className="font-semibold">案件情報</h2></CardHeader>
        <CardBody>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div><dt className="text-gray-500">案件金額（円）</dt><dd className="font-bold text-lg">¥{Number(deal.amount).toLocaleString()}</dd><p className="text-xs text-gray-500">この案件で見込む受注金額</p></div>
            <div><dt className="text-gray-500">受注確度（%）</dt><dd>{deal.probability}%</dd><p className="text-xs text-gray-500">案件が受注・成立する見込み度合い</p></div>
            <div><dt className="text-gray-500">確度加重見込み金額（円）</dt><dd>¥{Math.round(Number(deal.amount) * deal.probability / 100).toLocaleString()}</dd><p className="text-xs text-gray-500">案件金額 × 受注確度</p></div>
            <div><dt className="text-gray-500">受注予定日</dt><dd>{formatDate(deal.expected_close_date)}</dd><p className="text-xs text-gray-500">案件のクローズまたは受注を見込んでいる日付</p></div>
            <div><dt className="text-gray-500">ステータス</dt><dd>{deal.status}</dd><p className="text-xs text-gray-500">案件の状態。進行中・受注・失注など</p></div>
            <div className="col-span-2"><dt className="text-gray-500">メモ</dt><dd className="whitespace-pre-wrap">{deal.memo ?? '-'}</dd></div>
          </dl>
        </CardBody>
      </Card>

      {/* Activities */}
      <Card>
        <CardHeader><h2 className="font-semibold">活動履歴</h2></CardHeader>
        <CardBody className="p-0">
          {activities.length === 0 ? (
            <p className="px-6 py-4 text-sm text-gray-500">活動履歴がありません</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {activities.map((a) => (
                <li key={a.id} className="px-6 py-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded mr-2">{a.type}</span>
                      <span className="text-sm">{a.summary}</span>
                    </div>
                    <span className="text-xs text-gray-400">{formatDate(a.activity_date)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Tasks */}
      <Card>
        <CardHeader><h2 className="font-semibold">タスク</h2></CardHeader>
        <CardBody className="p-0">
          {tasks.length === 0 ? (
            <p className="px-6 py-4 text-sm text-gray-500">タスクがありません</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {tasks.map((t) => {
                const isOverdue = t.due_date && t.status === 'open' && new Date(t.due_date) < now
                return (
                  <li key={t.id} className={`px-6 py-3 flex items-center justify-between ${isOverdue ? 'bg-red-50' : ''}`}>
                    <span className={`text-sm ${isOverdue ? 'text-red-700 font-medium' : 'text-gray-900'} ${t.status === 'done' ? 'line-through text-gray-400' : ''}`}>{t.title}</span>
                    <span className={`text-xs ${isOverdue ? 'text-red-600' : 'text-gray-400'}`}>{formatDate(t.due_date)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Files */}
      <Card>
        <CardHeader><h2 className="font-semibold">ファイル</h2></CardHeader>
        <CardBody className="p-0">
          {files.length === 0 ? (
            <p className="px-6 py-4 text-sm text-gray-500">ファイルがありません</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {files.map((f) => (
                <li key={f.id} className="px-6 py-3 flex items-center justify-between">
                  <a href={f.file_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">{f.filename}</a>
                  <span className="text-xs text-gray-400">{formatDate(f.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
