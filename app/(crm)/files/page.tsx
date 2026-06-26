export const dynamic = 'force-dynamic'

import { getFiles } from '@/lib/db/queries/files'
import Link from 'next/link'
import { deleteFileAction } from '@/lib/actions/files'
import { formatDisplayDate } from '@/lib/utils/date'

const formatDate = formatDisplayDate

export default async function FilesPage() {
  const files = await getFiles()

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">ファイル一覧</h1>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">ファイル名</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">会社</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">ファイル種別</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">アップロード日</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {files.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">ファイルがありません</td></tr>
            ) : (
              files.map((f) => (
                <tr key={f.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <a href={f.file_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">
                      {f.filename}
                    </a>
                  </td>
                  <td className="px-6 py-3">
                    {f.company_id ? (
                      <Link href={`/companies/${f.company_id}`} className="text-gray-700 hover:underline">
                        {f.company_name ?? '-'}
                      </Link>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-3 text-gray-600">{f.file_type ?? f.mime_type ?? '-'}</td>
                  <td className="px-6 py-3 text-gray-500">{formatDate(f.created_at)}</td><td className="px-6 py-3 whitespace-nowrap"><Link href={`/files/${f.id}/edit`} className="text-xs text-blue-600 hover:underline mr-2">編集</Link><form action={deleteFileAction.bind(null, f.id, undefined)} className="inline"><button type="submit" className="text-xs text-red-500 hover:underline">削除</button></form></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
