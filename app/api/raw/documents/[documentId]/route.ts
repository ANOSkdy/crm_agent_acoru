import { z } from 'zod'
import { rawRepository,rawUser,rawError } from '@/lib/raw/server'
export const runtime='nodejs'
export async function GET(_req:Request,context:{params:Promise<{documentId:string}>}){try{const user=await rawUser();const {documentId}=await context.params;return Response.json(await rawRepository().document(user.id,z.uuid().parse(documentId)),{headers:{'Cache-Control':'private, no-store'}})}catch(e){return rawError(e)}}
