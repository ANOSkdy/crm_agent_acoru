export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getDealById, getDealStages } from '@/lib/db/queries/deals'
import { updateDealAction } from '@/lib/actions/deals'

interface Props { params: Promise<{ dealId: string }> }

export default async function EditPage({ params }: Props) {
  const { dealId } = await params
  const [record, stages] = await Promise.all([getDealById(dealId), getDealStages()])
  if (!record) notFound()
  async function action(formData: FormData) {
    'use server'
    await updateDealAction(dealId, formData)
  }
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">案件編集: {record.title}</h1>
      <form action={action} className="space-y-4 bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <input type="hidden" name="redirectTo" value={`/deals/${record.id}`} />
        <label className="block text-sm font-medium">案件名 *<input name="title" required defaultValue={record.title} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></label>
        <label className="block text-sm font-medium">案件金額（円）<input name="amount" type="number" min="0" defaultValue={record.amount} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></label>
        <label className="block text-sm font-medium">営業ステージ<select name="stage_id" defaultValue={record.stage_id ?? ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"><option value="">未設定</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="block text-sm font-medium">受注確度（%）<input name="probability" type="number" min="0" max="100" defaultValue={record.probability} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></label>
        <label className="block text-sm font-medium">受注予定日<input name="expected_close_date" type="date" defaultValue={record.expected_close_date?.slice(0, 10) ?? ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></label>
        <label className="block text-sm font-medium">ステータス<select name="status" defaultValue={record.status} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"><option value="open">進行中</option><option value="won">受注</option><option value="lost">失注</option></select></label>
        <label className="block text-sm font-medium">メモ<textarea name="memo" rows={3} defaultValue={record.memo ?? ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></label>
        <div className="flex gap-3 pt-2"><button type="submit" className="px-6 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">保存する</button><Link href={`/deals/${record.id}`} className="px-6 py-2 border border-gray-300 text-gray-700 text-sm rounded-md hover:bg-gray-50">キャンセル</Link></div>
      </form>
    </div>
  )
}
