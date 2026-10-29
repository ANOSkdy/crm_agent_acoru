export const dynamic = 'force-dynamic'
import { getTasks, getTaskTabs } from '@/lib/db/queries/tasks'
import { getCompanies } from '@/lib/db/queries/companies'
import { getDeals } from '@/lib/db/queries/deals'
import { requireApiUser, canEditDeal } from '@/lib/auth/deal-permissions'
import { TaskWorkspace } from '@/components/tasks/TaskWorkspace'
import { toDateInputValue } from '@/lib/utils/date'

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const user = await requireApiUser()
  const [tasks, tabs, companies, deals, params] = await Promise.all([getTasks(), getTaskTabs(), getCompanies(), getDeals(), searchParams])
  const selected = tabs.some(t => t.company_id === params.company) || (params.company === 'unassigned' && tasks.some(t => !t.company_id))
    ? params.company! : tabs[0]?.company_id ?? 'unassigned'
  const editableIds = tasks.filter(t => t.deal_id
    ? deals.some(d => d.id === t.deal_id && canEditDeal(user, d))
    : user.role === 'admin' || (user.role === 'member' && t.assigned_to === user.id)).map(t => t.id)
  return <div className="p-4 sm:p-6 space-y-5">
    <h1 className="text-2xl font-bold text-gray-900">課題管理</h1>
    <TaskWorkspace tabs={tabs} companies={companies.map(c => ({ id: c.id, name: c.name }))} tasks={tasks}
      selected={selected} requestedCompany={params.company} editableIds={editableIds} canWrite={user.role !== 'viewer'} today={toDateInputValue(new Date())} />
  </div>
}
