import { z } from 'zod'
import { rawUser,rawError,requireRawFlag } from '@/lib/raw/server'
import { sameOrigin,rawBody } from '@/lib/raw/http'
import { extractionService } from '@/lib/raw/provider'
export const runtime='nodejs'
export async function GET(request:Request){try{const user=await rawUser();const revision=z.uuid().parse(new URL(request.url).searchParams.get('revision'));return Response.json({runs:await extractionService().list(user.id,revision)},{headers:{'Cache-Control':'private, no-store'}})}catch(e){return rawError(e)}}
export async function POST(request:Request){try{sameOrigin(request);const user=await rawUser(true);requireRawFlag('extraction');const data=z.object({revision_id:z.uuid(),force:z.boolean().default(false)}).strict().parse(await rawBody(request,4096));return Response.json({id:await extractionService().start(user.id,data.revision_id,data.force)})}catch(e){return rawError(e)}}
