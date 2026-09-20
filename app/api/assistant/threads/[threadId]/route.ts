import { z } from 'zod'
import { requireApiUser } from '@/lib/auth/deal-permissions'
import { apiError, checkMutationRequest, readBody } from '@/lib/agent/http'
import { getAssistantState, renameAssistantThread } from '@/lib/db/queries/assistant'

type Context={params:Promise<{threadId:string}>}
export const runtime='nodejs'
export async function GET(req:Request,context:Context) {
  try {
    const user=await requireApiUser()
    const id=z.string().uuid().parse((await context.params).threadId)
    const before=z.string().uuid().nullable().parse(new URL(req.url).searchParams.get('before'))
    return Response.json(await getAssistantState(id,user,before),{headers:{'Cache-Control':'no-store'}})
  } catch(error) {return apiError(error)}
}
export async function PATCH(req:Request,context:Context) {
  try {
    checkMutationRequest(req)
    const user=await requireApiUser()
    const id=z.string().uuid().parse((await context.params).threadId)
    const {title}=z.object({title:z.string().trim().min(1).max(80)}).strict().parse(await readBody(req))
    await renameAssistantThread(id,user.id,title)
    return Response.json({ok:true})
  } catch(error) {return apiError(error)}
}
