export const dynamic = 'force-dynamic'

import { getCompanies } from '@/lib/db/queries/companies'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import Link from 'next/link'
import { formatDisplayDate } from '@/lib/utils/date'

const formatDate = formatDisplayDate

interface Props {
  searchParams: Promise<{ search?: string; status?: string }>
}

export default async function CompaniesPage({ searchParams }: Props) {
  const params = await searchParams
  const companies = await getCompanies(params.search, params.status)

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">顧客一覧</h1>
        <div className="flex gap-2">
          <a
            href="/api/export/companies"
            className="inline-flex items-center px-3 py-2 text-sm border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50"
          >
            CSVエクスポート
          </a>
          <Link
            href="/companies/new"
            className="inline-flex items-center px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            + 新規顧客
          </Link>
        </div>
      </div>

      {/* Filters */}
      <form className="flex gap-3">
        <input
          name="search"
          defaultValue={params.search}
          placeholder="会社名・業種で検索"
          className="flex-1 max-w-sm px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          name="status"
          defaultValue={params.status ?? ''}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">全ステータス</option>
          <option value="active">アクティブ</option>
          <option value="inactive">非アクティブ</option>
        </select>
        <button
          type="submit"
          className="px-4 py-2 bg-gray-800 text-white text-sm rounded-md hover:bg-gray-900"
        >
          検索
        </button>
      </form>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left border-b border-gray-200">
              <th className="px-6 py-3 text-xs font-medium text-gray-500">会社名</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500">業種</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500">電話番号</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500">ステータス</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500">作成日</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {companies.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  顧客が見つかりません
                </td>
              </tr>
            ) : (
              companies.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <Link href={`/companies/${c.id}`} className="font-medium text-blue-600 hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-gray-700">{c.industry ?? '-'}</td>
                  <td className="px-6 py-3 text-gray-700">{c.phone ?? '-'}</td>
                  <td className="px-6 py-3">
                    <Badge variant={statusBadgeVariant(c.status)}>
                      {c.status === 'active' ? 'アクティブ' : '非アクティブ'}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-gray-500">{formatDate(c.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
