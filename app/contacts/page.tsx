export const dynamic = 'force-dynamic'

import { getContacts } from '@/lib/db/queries/contacts'
import Link from 'next/link'

export default async function ContactsPage() {
  const contacts = await getContacts()

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">担当者一覧</h1>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">氏名</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">会社</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">部署</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">役職</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">メール</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">KDM</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {contacts.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">担当者が見つかりません</td></tr>
            ) : (
              contacts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{c.name}</td>
                  <td className="px-6 py-3">
                    <Link href={`/companies/${c.company_id}`} className="text-blue-600 hover:underline">
                      {c.company_name ?? '-'}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-gray-600">{c.department ?? '-'}</td>
                  <td className="px-6 py-3 text-gray-600">{c.position ?? '-'}</td>
                  <td className="px-6 py-3 text-gray-600">{c.email ?? '-'}</td>
                  <td className="px-6 py-3">{c.is_decision_maker ? '✓' : ''}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
