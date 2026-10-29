import { z } from 'zod'
import { rawUser,rawError,requireRawFlag } from '@/lib/raw/server'
import { sameOrigin,rawBody } from '@/lib/raw/http'
import { extractionService } from '@/lib/raw/provider'
export const runtime='nodejs'
export const maxDuration=90
type Context={params:Promise<{runId:string}>}
export async function GET(_request:Request,context:Context){try{const user=await rawUser();const id=z.uuid().parse((await context.params).runId);return Response.json(await extractionService().get(user.id,id),{headers:{'Cache-Control':'private, no-store'}})}catch(e){return rawError(e)}}
export async function POST(request:Request,context:Context){try{sameOrigin(request);const user=await rawUser(true);requireRawFlag('extraction');const id=z.uuid().parse((await context.params).runId);const {retry}=z.object({retry:z.boolean().default(false)}).strict().parse(await rawBody(request,4096));return Response.json(await extractionService().process(user.id,id,retry))}catch(e){return rawError(e)}}
