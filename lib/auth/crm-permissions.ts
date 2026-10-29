import 'server-only'
import { getSql, sql } from '@/lib/db'
import { requireApiUser } from './deal-permissions'
import { assertCrmUser, checkCrmRelations } from './crm-policy'
import { AppError } from '@/lib/http/errors'
import { getContactById } from '@/lib/db/queries/contacts'
import { z } from 'zod'

export async function requireCrmWrite(remove = false) { return assertCrmUser(await requireApiUser(), true, remove) }
export async function requireCrmRelations(input: Parameters<typeof checkCrmRelations>[2]) {
  const user = await requireCrmWrite()
  await checkCrmRelations({ query: (q, p) => getSql().query(q, p) }, user, input)
  return user
}
export async function requireContactWrite(id: string, companyId?: string, remove = false) {
  const user = await requireCrmWrite(remove)
  const record = await getContactById(z.uuid().parse(id))
  if (!record) throw new AppError(404, '担当者が見つかりません')
  if (companyId && companyId !== record.company_id) throw new AppError(400, '担当者と顧客が一致しません')
  await requireCrmRelations({ company_id: record.company_id, contact_id: id })
  return user
}
export async function recordCrmActor(userId: string, action: string, target: string, id: string) {
  await sql`INSERT INTO audit_logs(user_id,action,target_type,target_id) VALUES (${userId},${action},${target},${id})`
}
