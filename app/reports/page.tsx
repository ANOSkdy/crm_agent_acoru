export const dynamic = 'force-dynamic'

import { getReportsData } from '@/lib/db/queries/reports'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'

export default async function ReportsPage() {
  const data = await getReportsData()

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">レポート</h1>

      {/* Forecast Numbers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardBody>
            <p className="text-xs text-gray-500">今月クローズ予定</p>
            <p className="text-xl font-bold text-gray-900">¥{Number(data.thisMonthClose).toLocaleString()}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-gray-500">来月クローズ予定</p>
            <p className="text-xl font-bold text-gray-900">¥{Number(data.nextMonthClose).toLocaleString()}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-gray-500">加重フォーキャスト</p>
            <p className="text-xl font-bold text-blue-600">¥{Number(data.weightedForecast).toLocaleString()}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-gray-500">期限切れタスク</p>
            <p className="text-xl font-bold text-red-600">{data.overdueTaskCount}</p>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline by Stage */}
        <Card>
          <CardHeader><h2 className="font-semibold">ステージ別パイプライン</h2></CardHeader>
          <CardBody className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-6 py-2 text-left text-xs text-gray-500">ステージ</th>
                  <th className="px-6 py-2 text-right text-xs text-gray-500">件数</th>
                  <th className="px-6 py-2 text-right text-xs text-gray-500">合計金額</th>
                  <th className="px-6 py-2 text-right text-xs text-gray-500">加重金額</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.stageStats.map((s) => (
                  <tr key={s.stage_name}>
                    <td className="px-6 py-2 text-gray-900">{s.stage_name}</td>
                    <td className="px-6 py-2 text-right text-gray-700">{Number(s.deal_count)}</td>
                    <td className="px-6 py-2 text-right text-gray-700">¥{Number(s.total_amount).toLocaleString()}</td>
                    <td className="px-6 py-2 text-right text-blue-600">¥{Number(s.weighted_amount).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>

        {/* Activity Stats */}
        <Card>
          <CardHeader><h2 className="font-semibold">活動統計（過去30日）</h2></CardHeader>
          <CardBody>
            <div className="flex items-center justify-center h-24">
              <div className="text-center">
                <p className="text-4xl font-bold text-gray-900">{data.recentActivityCount}</p>
                <p className="text-sm text-gray-500 mt-1">活動記録数</p>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
