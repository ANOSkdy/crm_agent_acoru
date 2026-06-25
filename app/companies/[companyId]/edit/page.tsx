export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getCompanyById } from '@/lib/db/queries/companies'
import { updateCompanyAction } from '@/lib/actions/companies'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function EditCompanyPage({ params }: Props) {
  const { companyId } = await params
  const company = await getCompanyById(companyId)
  if (!company) notFound()

  async function action(formData: FormData) {
    'use server'
    await updateCompanyAction(companyId, formData)
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">顧客編集: {company.name}</h1>
      <form action={action} className="space-y-4 bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">会社名 *</label>
          <input name="name" required defaultValue={company.name} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">法人番号</label>
          <input name="corporate_number" defaultValue={company.corporate_number ?? ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">業種</label>
          <input name="industry" defaultValue={company.industry ?? ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ウェブサイト</label>
          <input name="website_url" type="url" defaultValue={company.website_url ?? ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">郵便番号</label>
            <input name="postal_code" defaultValue={company.postal_code ?? ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
            <input name="phone" defaultValue={company.phone ?? ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">住所</label>
          <input name="address" defaultValue={company.address ?? ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">流入元</label>
          <input name="source" defaultValue={company.source ?? ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ステータス</label>
          <select name="status" defaultValue={company.status} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="active">アクティブ</option>
            <option value="inactive">非アクティブ</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">メモ</label>
          <textarea name="memo" rows={3} defaultValue={company.memo ?? ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" className="px-6 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
            保存する
          </button>
          <a href={`/companies/${companyId}`} className="px-6 py-2 border border-gray-300 text-gray-700 text-sm rounded-md hover:bg-gray-50">
            キャンセル
          </a>
        </div>
      </form>
    </div>
  )
}
