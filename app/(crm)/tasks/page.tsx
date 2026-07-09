export const dynamic = 'force-dynamic'

import { getTasks } from '@/lib/db/queries/tasks'
import { TasksGrid } from '@/components/grid/TasksGrid'

export default async function TasksPage() {
  const tasks = await getTasks()
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">タスク一覧</h1>
      <TasksGrid tasks={tasks} />

    </div>
  )
}
