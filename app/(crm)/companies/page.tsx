export const dynamic = 'force-dynamic'

import { getCompanies } from '@/lib/db/queries/companies'
import Link from 'next/link'
import { CompaniesGrid } from '@/components/grid/CompaniesGrid'

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

      <CompaniesGrid companies={companies} />

    </div>
  )
}
