import { z } from 'zod'
import { requireApiUser } from '@/lib/auth/deal-permissions'
import { apiError, checkMutationRequest, readBody } from '@/lib/agent/http'
import { createThreadSchema } from '@/lib/assistant/schema'
import { createAssistantThread, listAssistantThreads } from '@/lib/db/queries/assistant'

export const runtime='nodejs'
export async function GET(req:Request) {
  try {
    const user=await requireApiUser()
    const params=new URL(req.url).searchParams
    const query=z.string().max(160).parse(params.get('q')??'')
    const offset=z.coerce.number().int().min(0).max(10000).parse(params.get('offset')??0)
    return Response.json(await listAssistantThreads(user.id,query,offset),{headers:{'Cache-Control':'no-store'}})
  } catch(error) {return apiError(error)}
}
export async function POST(req:Request) {
  try {
    checkMutationRequest(req)
    const user=await requireApiUser()
    const body=createThreadSchema.parse(await readBody(req))
    return Response.json({thread:await createAssistantThread(user.id,body.title)},{status:201})
  } catch(error) {return apiError(error)}
}
