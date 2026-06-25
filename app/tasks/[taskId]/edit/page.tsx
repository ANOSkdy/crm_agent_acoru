export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { toDateInputValue } from '@/lib/utils/date'
import { getTaskById } from '@/lib/db/queries/tasks'
import { getCompanies } from '@/lib/db/queries/companies'
import { getDeals } from '@/lib/db/queries/deals'
import { updateTaskAction } from '@/lib/actions/tasks'

interface Props { params: Promise<{ taskId: string }> }

export default async function EditPage({ params }: Props) {
  const { taskId } = await params
  const record = await getTaskById(taskId)
  const [companies, deals] = await Promise.all([getCompanies(), getDeals()])
  if (!record) notFound()
  async function action(formData: FormData) {
    'use server'
    await updateTaskAction(taskId, formData)
  }
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">タスク編集: {record.title}</h1>
      <form action={action} className="space-y-4 bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <input type="hidden" name="redirectTo" value={record.company_id ? `/companies/${record.company_id}` : '/tasks'} />
        <label className="block text-sm font-medium">タイトル *<input name="title" required defaultValue={record.title} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></label>
        <label className="block text-sm font-medium">説明<textarea name="description" rows={3} defaultValue={record.description ?? ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></label>
        <label className="block text-sm font-medium">期限<input name="due_date" type="date" defaultValue={toDateInputValue(record.due_date)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></label>
        <label className="block text-sm font-medium">優先度<select name="priority" defaultValue={record.priority} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></label>
        <label className="block text-sm font-medium">ステータス<select name="status" defaultValue={record.status} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"><option value="open">未完</option><option value="done">完了</option></select></label>
        <label className="block text-sm font-medium">会社<select name="company_id" defaultValue={record.company_id ?? ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"><option value="">未設定</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="block text-sm font-medium">案件<select name="deal_id" defaultValue={record.deal_id ?? ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"><option value="">未設定</option>{deals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label>
        <div className="flex gap-3 pt-2"><button type="submit" className="px-6 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">保存する</button><Link href={record.company_id ? `/companies/${record.company_id}` : '/tasks'} className="px-6 py-2 border border-gray-300 text-gray-700 text-sm rounded-md hover:bg-gray-50">キャンセル</Link></div>
      </form>
    </div>
  )
}
