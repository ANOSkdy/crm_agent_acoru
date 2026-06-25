export const dynamic = 'force-dynamic'

import { getTasks } from '@/lib/db/queries/tasks'
import { completeTaskAction, deleteTaskAction } from '@/lib/actions/tasks'
import Link from 'next/link'

const priorityLabels: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

const priorityColors: Record<string, string> = {
  high: 'text-red-600',
  medium: 'text-yellow-600',
  low: 'text-green-600',
}

export default async function TasksPage() {
  const tasks = await getTasks()
  const now = new Date()

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">タスク一覧</h1>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">タイトル</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">会社</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">優先度</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">期限</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">ステータス</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tasks.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">タスクがありません</td></tr>
            ) : (
              tasks.map((t) => {
                const isOverdue = t.due_date && t.status === 'open' && new Date(t.due_date) < now
                return (
                  <tr key={t.id} className={`hover:bg-gray-50 ${isOverdue ? 'bg-red-50' : ''}`}>
                    <td className="px-6 py-3">
                      <span className={`font-medium ${isOverdue ? 'text-red-700' : 'text-gray-900'} ${t.status === 'done' ? 'line-through text-gray-400' : ''}`}>
                        {t.title}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      {t.company_id ? (
                        <Link href={`/companies/${t.company_id}`} className="text-blue-600 hover:underline">
                          {t.company_name ?? '-'}
                        </Link>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`font-medium ${priorityColors[t.priority] ?? ''}`}>
                        {priorityLabels[t.priority] ?? t.priority}
                      </span>
                    </td>
                    <td className={`px-6 py-3 ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                      {t.due_date?.toString().slice(0, 10) ?? '-'}
                      {isOverdue && ' ⚠'}
                    </td>
                    <td className="px-6 py-3 text-gray-600">{t.status === 'done' ? '完了' : '未完'}</td>
                    <td className="px-6 py-3">
                      {t.status === 'open' && (
                        <form action={completeTaskAction.bind(null, t.id)} className="inline">
                          <button type="submit" className="text-xs text-green-600 hover:underline mr-2">完了</button>
                        </form>
                      )}
                      <form action={deleteTaskAction.bind(null, t.id)} className="inline">
                        <button type="submit" className="text-xs text-red-500 hover:underline">削除</button>
                      </form>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
