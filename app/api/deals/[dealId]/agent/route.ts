import { z } from 'zod'
import { requireDealAccess, canEditDeal } from '@/lib/auth/deal-permissions'
import { expireRuns, getAgentData, startRun } from '@/lib/db/queries/agent'
import { runDealAgent } from '@/lib/agent/runtime'
import { apiError, checkMutationRequest, readBody } from '@/lib/agent/http'
import { messageSchema } from '@/lib/agent/schema'

export const runtime = 'nodejs'
export const maxDuration = 180
type Context = { params: Promise<{ dealId: string }> }
export async function GET(_req: Request, context: Context) {
  try {
    const dealId = z.string().uuid().parse((await context.params).dealId)
    const { user, deal } = await requireDealAccess(dealId)
    await expireRuns(dealId)
    return Response.json({ ...await getAgentData(dealId), canEdit: canEditDeal(user, deal) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return apiError(error) }
}
export async function POST(req: Request, context: Context) {
  try {
    checkMutationRequest(req)
    const dealId = z.string().uuid().parse((await context.params).dealId)
    const { user, deal } = await requireDealAccess(dealId)
    const body = messageSchema.parse(await readBody(req))
    await expireRuns(dealId)
    if (await startRun(dealId, user.id, body.requestId, body.message)) await runDealAgent(dealId, body.requestId, canEditDeal(user, deal))
    return Response.json({ ...await getAgentData(dealId), canEdit: canEditDeal(user, deal) })
  } catch (error) { return apiError(error) }
}
