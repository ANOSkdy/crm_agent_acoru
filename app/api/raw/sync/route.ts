import { z } from 'zod'
import { rawError,requireRawFlag,rawDatabase,rawRepository } from '@/lib/raw/server'
import { RawCredentials } from '@/lib/raw/credentials'
import { rawBody } from '@/lib/raw/http'
import { rawInputSchema,RAW_MAX_FILES } from '@/lib/raw/domain'
export const runtime='nodejs'
export async function POST(request:Request){try{
 requireRawFlag('sync');requireRawFlag('ingest')
 const actor=await new RawCredentials(rawDatabase).authenticate(request.headers.get('authorization'))
 const input=z.object({documents:z.array(z.unknown()).min(1).max(RAW_MAX_FILES)}).strict().parse(await rawBody(request))
 const results=[]
 for(const [index,value] of input.documents.entries()){try{
  const data=rawInputSchema.parse(value);if(data.source_type!=='local_sync'||!data.content_hash)throw new Error('RAW_IDENTITY')
  // A scoped ingest credential can never consent to provider processing on the owner's behalf.
  const result=await rawRepository().ingest(actor,{...data,ai_processing_allowed:false});results.push({index,...result})
 }catch(e){const response=rawError(e),body=await response.json();results.push({index,status:response.status===409?'conflict':'rejected',error:body.error})}}
 return Response.json({results},{headers:{'Cache-Control':'private, no-store'}})
}catch(e){return rawError(e)}}
