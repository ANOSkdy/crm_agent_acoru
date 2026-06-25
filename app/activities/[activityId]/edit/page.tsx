export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getActivityById } from '@/lib/db/queries/activities'
import { getContacts } from '@/lib/db/queries/contacts'
import { getDeals } from '@/lib/db/queries/deals'
import { updateActivityAction } from '@/lib/actions/activities'

interface Props { params: Promise<{ activityId: string }> }

export default async function EditPage({ params }: Props) {
  const { activityId } = await params
  const record = await getActivityById(activityId)
  const [contacts, deals] = record ? await Promise.all([getContacts(record.company_id), getDeals({ companyId: record.company_id })]) : [[], []]
  if (!record) notFound()
  async function action(formData: FormData) {
    'use server'
    await updateActivityAction(activityId, formData)
  }
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">活動編集: {record.summary}</h1>
      <form action={action} className="space-y-4 bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <input type="hidden" name="redirectTo" value={`/companies/${record.company_id}`} />
        <input type="hidden" name="company_id" value={record.company_id} />
        <label className="block text-sm font-medium">種別<select name="type" defaultValue={record.type} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"><option value="call">電話</option><option value="email">メール</option><option value="meeting">ミーティング</option><option value="visit">訪問</option><option value="other">その他</option></select></label>
        <label className="block text-sm font-medium">日時<input name="activity_date" type="datetime-local" required defaultValue={record.activity_date?.slice(0, 16)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></label>
        <label className="block text-sm font-medium">概要 *<input name="summary" required defaultValue={record.summary} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></label>
        <label className="block text-sm font-medium">担当者<select name="contact_id" defaultValue={record.contact_id ?? ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"><option value="">未設定</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="block text-sm font-medium">案件<select name="deal_id" defaultValue={record.deal_id ?? ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"><option value="">未設定</option>{deals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label>
        <label className="block text-sm font-medium">詳細<textarea name="body" rows={3} defaultValue={record.body ?? ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></label>
        <label className="block text-sm font-medium">次のアクション<input name="next_action" defaultValue={record.next_action ?? ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></label>
        <div className="flex gap-3 pt-2"><button type="submit" className="px-6 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">保存する</button><Link href={`/companies/${record.company_id}`} className="px-6 py-2 border border-gray-300 text-gray-700 text-sm rounded-md hover:bg-gray-50">キャンセル</Link></div>
      </form>
    </div>
  )
}
