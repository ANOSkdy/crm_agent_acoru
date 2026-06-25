export const dynamic = 'force-dynamic'

import { getDeals, getDealStages } from '@/lib/db/queries/deals'
import { Badge, stageBadgeVariant } from '@/components/ui/Badge'
import Link from 'next/link'
import { deleteDealAction } from '@/lib/actions/deals'

function formatDate(value: Date | string | null | undefined) {
  if (!value) return '-'
  return new Date(value).toISOString().slice(0, 10)
}

interface Props {
  searchParams: Promise<{ stageId?: string; status?: string }>
}

export default async function DealsPage({ searchParams }: Props) {
  const params = await searchParams
  const [deals, stages] = await Promise.all([
    getDeals({ stageId: params.stageId, status: params.status }),
    getDealStages(),
  ])

  const totalAmount = deals.reduce((sum, d) => sum + Number(d.amount), 0)
  const weightedAmount = deals.reduce((sum, d) => sum + Math.round(Number(d.amount) * d.probability / 100), 0)

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">案件一覧</h1>
        <a
          href="/api/export/deals"
          className="inline-flex items-center px-3 py-2 text-sm border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50"
        >
          CSVエクスポート
        </a>
      </div>

      {/* Filters */}
      <form className="flex gap-3">
        <select name="stageId" defaultValue={params.stageId ?? ''} className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">全ステージ</option>
          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select name="status" defaultValue={params.status ?? ''} className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">全ステータス</option>
          <option value="open">進行中</option>
          <option value="won">受注</option>
          <option value="lost">失注</option>
        </select>
        <button type="submit" className="px-4 py-2 bg-gray-800 text-white text-sm rounded-md hover:bg-gray-900">絞り込み</button>
      </form>

      {/* Totals */}
      <div className="flex flex-wrap gap-6 text-sm">
        <div className="text-gray-600">案件件数: <strong>{deals.length}</strong><p className="text-xs text-gray-500">表示対象の案件数</p></div>
        <div className="text-gray-600">案件金額合計（円）: <strong>¥{totalAmount.toLocaleString()}</strong><p className="text-xs text-gray-500">表示対象案件の金額を単純合計した金額</p></div>
        <div className="text-gray-600">確度加重見込み金額（円）: <strong>¥{weightedAmount.toLocaleString()}</strong><p className="text-xs text-gray-500">確度加重見込み金額 = 案件金額 × 受注確度</p></div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">案件名</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">会社</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">営業ステージ</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500">案件金額（円）</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500">受注確度（%）</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">受注予定日</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {deals.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-500">案件が見つかりません</td></tr>
            ) : (
              deals.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <Link href={`/deals/${d.id}`} className="font-medium text-blue-600 hover:underline">{d.title}</Link>
                  </td>
                  <td className="px-6 py-3">
                    <Link href={`/companies/${d.company_id}`} className="text-gray-700 hover:underline">{d.company_name ?? '-'}</Link>
                  </td>
                  <td className="px-6 py-3"><Badge variant={stageBadgeVariant(d.stage_name)}>{d.stage_name ?? '-'}</Badge></td>
                  <td className="px-6 py-3 text-right">¥{Number(d.amount).toLocaleString()}</td>
                  <td className="px-6 py-3 text-right">{d.probability}%</td>
                  <td className="px-6 py-3 text-gray-600">{formatDate(d.expected_close_date)}</td><td className="px-6 py-3 whitespace-nowrap"><Link href={`/deals/${d.id}/edit`} className="text-xs text-blue-600 hover:underline mr-2">編集</Link><form action={deleteDealAction.bind(null, d.id, undefined)} className="inline"><button type="submit" className="text-xs text-red-500 hover:underline">削除</button></form></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
