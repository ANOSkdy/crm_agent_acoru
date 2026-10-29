import { z } from 'zod'
import { rawRepository,rawUser,rawError,requireRawFlag } from '@/lib/raw/server'
import { rawBody,sameOrigin } from '@/lib/raw/http'
import { RAW_MAX_FILES,rawInputSchema } from '@/lib/raw/domain'
export const runtime='nodejs'
export async function GET(req:Request){try{const user=await rawUser();const page=z.coerce.number().int().min(0).max(100000).parse(new URL(req.url).searchParams.get('page')??0);return Response.json(await rawRepository().list(user.id,page),{headers:{'Cache-Control':'private, no-store'}})}catch(e){return rawError(e)}}
export async function POST(req:Request){try{
 sameOrigin(req);const user=await rawUser(true);requireRawFlag('ingest')
 const {documents}=z.object({documents:z.array(z.unknown()).min(1).max(RAW_MAX_FILES)}).strict().parse(await rawBody(req))
 const results=[]
 for(const [index,input] of documents.entries()){try{const data=rawInputSchema.parse(input);if(data.source_type==='local_sync')throw new Error('RAW_IDENTITY');results.push({index,...await rawRepository().ingest(user.id,data)})}catch(e){const response=rawError(e);results.push({index,status:'rejected',...await response.json()})}}
 return Response.json({results},{headers:{'Cache-Control':'no-store'}})
}catch(e){return rawError(e)}}
