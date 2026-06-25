export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getContactById } from '@/lib/db/queries/contacts'
import { updateContactAction } from '@/lib/actions/contacts'

interface Props { params: Promise<{ contactId: string }> }

export default async function EditPage({ params }: Props) {
  const { contactId } = await params
  const record = await getContactById(contactId)
  if (!record) notFound()
  async function action(formData: FormData) {
    'use server'
    await updateContactAction(contactId, formData)
  }
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">担当者編集: {record.name}</h1>
      <form action={action} className="space-y-4 bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <input type="hidden" name="redirectTo" value={`/companies/${record.company_id}`} />
        <input type="hidden" name="company_id" value={record.company_id} />
        <label className="block text-sm font-medium">氏名 *<input name="name" required defaultValue={record.name} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></label>
        <label className="block text-sm font-medium">部署<input name="department" defaultValue={record.department ?? ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></label>
        <label className="block text-sm font-medium">役職<input name="position" defaultValue={record.position ?? ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></label>
        <label className="block text-sm font-medium">メール<input name="email" type="email" defaultValue={record.email ?? ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></label>
        <label className="block text-sm font-medium">電話<input name="phone" defaultValue={record.phone ?? ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_decision_maker" value="true" defaultChecked={record.is_decision_maker} />キーマン</label>
        <label className="block text-sm font-medium">メモ<textarea name="memo" rows={3} defaultValue={record.memo ?? ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></label>
        <div className="flex gap-3 pt-2"><button type="submit" className="px-6 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">保存する</button><Link href={`/companies/${record.company_id}`} className="px-6 py-2 border border-gray-300 text-gray-700 text-sm rounded-md hover:bg-gray-50">キャンセル</Link></div>
      </form>
    </div>
  )
}
