import 'server-only'
import { getCurrentUser } from './session'
import { getDealById } from '@/lib/db/queries/deals'
import { getTaskById } from '@/lib/db/queries/tasks'
import { AppError } from '@/lib/http/errors'
import type { AppUser } from '@/lib/db/queries/users'

export function canEditDeal(user: Pick<AppUser, 'id' | 'role' | 'is_active'>, deal: { owner_user_id: string | null }) {
  return user.is_active && (user.role === 'admin' || (user.role === 'member' && deal.owner_user_id === user.id))
}
export async function requireApiUser() {
  const user = await getCurrentUser()
  if (!user || !user.is_active) throw new AppError(401, 'ログインしてください')
  if (!['admin', 'member', 'viewer'].includes(user.role)) throw new AppError(403, '利用権限がありません')
  return user
}
export async function requireDealAccess(dealId: string, write = false) {
  const user = await requireApiUser()
  const deal = await getDealById(dealId)
  if (!deal) throw new AppError(404, '案件が見つかりません')
  if (write && !canEditDeal(user, deal)) throw new AppError(403, 'この案件を更新できるのは管理者または担当者です')
  return { user, deal }
}
export async function requireTaskWrite(taskId: string) {
  const user = await requireApiUser()
  const task = await getTaskById(taskId)
  if (!task) throw new AppError(404, '課題が見つかりません')
  if (task.deal_id) await requireDealAccess(task.deal_id, true)
  else if (user.role !== 'admin' && !(user.role === 'member' && task.assigned_to === user.id)) throw new AppError(403, '課題の更新権限がありません')
  return { user, task }
}
