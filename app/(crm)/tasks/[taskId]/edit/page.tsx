export const dynamic = 'force-dynamic'
import { notFound } from 'next/navigation'
import { getTaskById } from '@/lib/db/queries/tasks'
import { getCompanies } from '@/lib/db/queries/companies'
import { requireTaskWrite } from '@/lib/auth/deal-permissions'
import { TaskForm } from '@/components/tasks/TaskForm'
import { SourceLinks } from '@/components/raw/SourceLinks'
import { toDateInputValue } from '@/lib/utils/date'
import { z } from 'zod'

export default async function EditPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params
  if (!z.uuid().safeParse(taskId).success) notFound()
  const task = await getTaskById(taskId)
  if (!task) notFound()
  await requireTaskWrite(taskId)
  const companies = await getCompanies()
  return <div className="p-4 sm:p-6 max-w-3xl space-y-5">
    <h1 className="text-2xl font-bold">課題編集: No {task.issue_number}</h1>
    <SourceLinks type="task" id={task.id} />
    <div className="bg-white p-6 rounded-lg border border-gray-200">
      <TaskForm task={task} companies={companies.map(c => ({ id: c.id, name: c.name }))} today={toDateInputValue(new Date())} />
    </div>
  </div>
}
