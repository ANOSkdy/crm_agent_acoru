export const dynamic = 'force-dynamic'

import { getDashboardData } from '@/lib/db/queries/dashboard'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import Link from 'next/link'


export default async function DashboardPage() {
  const data = await getDashboardData()

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardBody>
            <p className="text-sm text-gray-500">本日の課題</p>
            <p className="text-3xl font-bold text-blue-600">{data.todayTasks}</p>
            <Link href="/tasks" className="text-xs text-blue-500 hover:underline">課題一覧 →</Link>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-sm text-gray-500">期限切れ課題</p>
            <p className="text-3xl font-bold text-red-600">{data.overdueTasks}</p>
            <Link href="/tasks" className="text-xs text-red-500 hover:underline">確認する →</Link>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-sm text-gray-500">進行中の案件</p>
            <p className="text-3xl font-bold text-green-600">{data.openDeals}</p>
            <Link href="/deals" className="text-xs text-green-500 hover:underline">案件一覧 →</Link>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stage Stats */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-900">パイプライン</h2>
          </CardHeader>
          <CardBody className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-6 py-2 text-xs font-medium text-gray-500">営業ステージ</th>
                  <th className="px-6 py-2 text-xs font-medium text-gray-500 text-right">案件件数</th>
                  <th className="px-6 py-2 text-xs font-medium text-gray-500 text-right">案件金額合計（円）</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.stageStats.map((s) => (
                  <tr key={s.stage_name}>
                    <td className="px-6 py-2 text-gray-900">{s.stage_name}</td>
                    <td className="px-6 py-2 text-right text-gray-700">{Number(s.deal_count)}</td>
                    <td className="px-6 py-2 text-right text-gray-700">¥{Number(s.total_amount).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
