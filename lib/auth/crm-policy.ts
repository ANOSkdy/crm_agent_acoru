import { z } from 'zod'
import { AppError } from '../http/errors'
import type { AppUser } from '../db/queries/users'

export interface CrmDatabase { query(text: string, params?: unknown[]): Promise<Record<string, unknown>[]> }
export function assertCrmUser(user: AppUser | null, write = false, remove = false): AppUser {
  if (!user?.is_active) throw new AppError(401, 'ログインしてください')
  if (!['admin', 'member', 'viewer'].includes(user.role) || (write && user.role === 'viewer') || (remove && user.role !== 'admin')) throw new AppError(403, '操作権限がありません')
  return user
}
export async function checkCrmRelations(db: CrmDatabase, user: AppUser, input: { company_id?: string | null; deal_id?: string | null; contact_id?: string | null }, write = true) {
  assertCrmUser(user, write)
  const ids = z.object({ company_id: z.uuid().nullish(), deal_id: z.uuid().nullish(), contact_id: z.uuid().nullish() }).parse(input)
  const rows = await db.query(`SELECT
    (SELECT id FROM companies WHERE id=$1::uuid AND deleted_at IS NULL) AS company,
    (SELECT jsonb_build_object('company_id',d.company_id,'owner_user_id',d.owner_user_id) FROM deals d JOIN companies c ON c.id=d.company_id WHERE d.id=$2::uuid AND d.deleted_at IS NULL AND c.deleted_at IS NULL) AS deal,
    (SELECT company_id FROM contacts WHERE id=$3::uuid AND deleted_at IS NULL) AS contact_company`, [ids.company_id ?? null, ids.deal_id ?? null, ids.contact_id ?? null])
  const row = rows[0]
  const deal = row.deal as { company_id: string; owner_user_id: string | null } | null
  if ((ids.company_id && !row.company) || (ids.deal_id && !deal) || (ids.contact_id && !row.contact_company)) throw new AppError(404, '関連レコードが見つかりません')
  const company = ids.company_id ?? deal?.company_id ?? row.contact_company
  if ((deal && company !== deal.company_id) || (ids.contact_id && company !== row.contact_company)) throw new AppError(400, '顧客と関連レコードの所属が一致しません')
  if (write && deal && user.role !== 'admin' && deal.owner_user_id !== user.id) throw new AppError(403, 'この案件を更新できません')
}
