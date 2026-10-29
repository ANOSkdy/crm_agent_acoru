import { z } from 'zod'
import { rawRepository,rawUser,rawError } from '@/lib/raw/server'
import { rawBody,sameOrigin } from '@/lib/raw/http'
export const runtime='nodejs'
type Context={params:Promise<{revisionId:string}>}
export async function GET(_req:Request,context:Context){try{const user=await rawUser();const {revisionId}=await context.params;return Response.json(await rawRepository().revision(user.id,z.uuid().parse(revisionId)),{headers:{'Cache-Control':'private, no-store'}})}catch(e){return rawError(e)}}
export async function PATCH(req:Request,context:Context){try{sameOrigin(req);const user=await rawUser(true);const {revisionId}=await context.params;const {allowed}=z.object({allowed:z.boolean()}).strict().parse(await rawBody(req,1000));await rawRepository().consent(user.id,z.uuid().parse(revisionId),allowed);return Response.json({ok:true})}catch(e){return rawError(e)}}
