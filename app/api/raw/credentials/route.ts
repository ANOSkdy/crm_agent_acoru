import { z } from 'zod'
import { rawUser,rawError,requireRawFlag,rawDatabase } from '@/lib/raw/server'
import { RawCredentials } from '@/lib/raw/credentials'
import { sameOrigin,rawBody } from '@/lib/raw/http'
export const runtime='nodejs'
export async function GET(){try{const user=await rawUser(true);return Response.json({credentials:await new RawCredentials(rawDatabase).list(user.id)},{headers:{'Cache-Control':'private, no-store'}})}catch(e){return rawError(e)}}
export async function POST(request:Request){try{sameOrigin(request);const user=await rawUser(true);const input=z.discriminatedUnion('action',[z.object({action:z.literal('issue'),label:z.string().trim().min(1).max(100)}).strict(),z.object({action:z.literal('revoke'),id:z.uuid()}).strict()]).parse(await rawBody(request,4096));const repo=new RawCredentials(rawDatabase);if(input.action==='revoke'){await repo.revoke(user.id,input.id);return Response.json({ok:true})}requireRawFlag('sync');return Response.json(await repo.issue(user.id,input.label),{headers:{'Cache-Control':'private, no-store'}})}catch(e){return rawError(e)}}
