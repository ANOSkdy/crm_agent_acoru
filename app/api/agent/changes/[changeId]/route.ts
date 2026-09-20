import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireDealAccess, requireApiUser } from '@/lib/auth/deal-permissions'
import { getChange, applyChanges, rejectChange } from '@/lib/db/queries/agent'
import { apiError, checkMutationRequest, readBody } from '@/lib/agent/http'
import { applySchema } from '@/lib/agent/schema'

export const runtime = 'nodejs'
export async function POST(req: Request, context: { params: Promise<{ changeId: string }> }) {
  try {
    checkMutationRequest(req)
    const actor = await requireApiUser()
    const changeId = z.string().uuid().parse((await context.params).changeId)
    const change = await getChange(changeId, actor.id)
    const { user } = await requireDealAccess(change.deal_id, true)
    const body = applySchema.parse(await readBody(req))
    const result = body.action === 'apply' ? await applyChanges(changeId, user.id, body.operations) : await rejectChange(changeId, user.id)
    for (const path of [`/deals/${change.deal_id}`, '/deals', '/tasks', '/activities', '/dashboard']) revalidatePath(path)
    return Response.json({ ok: true, result })
  } catch (error) { return apiError(error) }
}
