import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { getTaskById } from '@/lib/db/queries/tasks'

// Tasks are edited in the grid; this route remains for old links.
export default async function EditTaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params
  if (!z.uuid().safeParse(taskId).success) notFound()
  const task = await getTaskById(taskId)
  if (!task) notFound()
  redirect(`/tasks?company=${task.company_id ?? 'unassigned'}`)
}
