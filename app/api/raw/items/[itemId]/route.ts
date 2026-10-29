import { z } from 'zod'
import { rawUser,rawError,requireRawFlag } from '@/lib/raw/server'
import { sameOrigin,rawBody } from '@/lib/raw/http'
import { extractionService } from '@/lib/raw/provider'
export const runtime='nodejs'
const action=z.discriminatedUnion('action',[
 z.object({action:z.literal('approve'),payload:z.unknown(),company_id:z.uuid().nullable(),deal_id:z.uuid().nullable(),confirm_new:z.boolean().default(false)}).strict(),
 z.object({action:z.literal('reject')}).strict(),z.object({action:z.literal('apply')}).strict(),
])
export async function POST(request:Request,{params}:{params:Promise<{itemId:string}>}){try{
 sameOrigin(request);const user=await rawUser(true);const id=z.uuid().parse((await params).itemId),input=action.parse(await rawBody(request,32000));const service=extractionService()
 if(input.action==='apply'){requireRawFlag('apply');return Response.json(await service.apply(user.id,id))}
 await service.review(user.id,id,input.action==='reject'?{reject:true}:input)
 return Response.json({ok:true})
}catch(e){return rawError(e)}}

export async function GET(_request:Request,{params}:{params:Promise<{itemId:string}>}){try{const user=await rawUser();const service=extractionService();const item=await service.item(user.id,z.uuid().parse((await params).itemId));const {run}=await service.get(user.id,item.extraction_run_id);return Response.json({run_id:run.id,revision_id:run.raw_revision_id},{headers:{'Cache-Control':'private, no-store'}})}catch(e){return rawError(e)}}
