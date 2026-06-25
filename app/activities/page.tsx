export const dynamic = 'force-dynamic'

import { getActivities } from '@/lib/db/queries/activities'
import Link from 'next/link'

const activityTypeLabels: Record<string, string> = {
  call: '電話',
  email: 'メール',
  meeting: 'ミーティング',
  visit: '訪問',
  other: 'その他',
}

export default async function ActivitiesPage() {
  const activities = await getActivities()

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">活動履歴</h1>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">種別</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">概要</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">会社</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">担当者</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">日時</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {activities.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">活動履歴がありません</td></tr>
            ) : (
              activities.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <span className="inline-block text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                      {activityTypeLabels[a.type] ?? a.type}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-900 max-w-xs truncate">{a.summary}</td>
                  <td className="px-6 py-3">
                    <Link href={`/companies/${a.company_id}`} className="text-blue-600 hover:underline">
                      {a.company_name ?? '-'}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-gray-600">{a.contact_name ?? '-'}</td>
                  <td className="px-6 py-3 text-gray-500">{a.activity_date?.toString().slice(0, 10)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
