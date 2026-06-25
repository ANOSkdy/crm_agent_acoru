export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getFileById } from '@/lib/db/queries/files'
import { getCompanies } from '@/lib/db/queries/companies'
import { getDeals } from '@/lib/db/queries/deals'
import { updateFileAction } from '@/lib/actions/files'

interface Props { params: Promise<{ fileId: string }> }

export default async function EditPage({ params }: Props) {
  const { fileId } = await params
  const record = await getFileById(fileId)
  const [companies, deals] = await Promise.all([getCompanies(), getDeals()])
  if (!record) notFound()
  async function action(formData: FormData) {
    'use server'
    await updateFileAction(fileId, formData)
  }
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">ファイル編集: {record.filename}</h1>
      <form action={action} className="space-y-4 bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <input type="hidden" name="redirectTo" value={record.company_id ? `/companies/${record.company_id}` : '/files'} />
        <label className="block text-sm font-medium">ファイル名 *<input name="filename" required defaultValue={record.filename} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></label>
        <label className="block text-sm font-medium">URL *<input name="file_url" type="url" required defaultValue={record.file_url} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></label>
        <label className="block text-sm font-medium">MIMEタイプ<input name="mime_type" defaultValue={record.mime_type ?? ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></label>
        <label className="block text-sm font-medium">ファイル種別<input name="file_type" defaultValue={record.file_type ?? ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></label>
        <label className="block text-sm font-medium">会社<select name="company_id" defaultValue={record.company_id ?? ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"><option value="">未設定</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="block text-sm font-medium">案件<select name="deal_id" defaultValue={record.deal_id ?? ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"><option value="">未設定</option>{deals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label>
        <div className="flex gap-3 pt-2"><button type="submit" className="px-6 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">保存する</button><Link href={record.company_id ? `/companies/${record.company_id}` : '/files'} className="px-6 py-2 border border-gray-300 text-gray-700 text-sm rounded-md hover:bg-gray-50">キャンセル</Link></div>
      </form>
    </div>
  )
}
