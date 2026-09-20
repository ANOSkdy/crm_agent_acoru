import { z } from 'zod'
import { requireApiUser } from '@/lib/auth/deal-permissions'
import { apiError, checkMutationRequest, readBody } from '@/lib/agent/http'
import { messageSchema } from '@/lib/agent/schema'
import { AgentError } from '@/lib/agent/errors'
import { getAssistantState, requireAssistantThread, expireAssistantRuns, startAssistantRun } from '@/lib/db/queries/assistant'
import { runWorkspaceAssistant } from '@/lib/assistant/runtime'
import type { AssistantEvent } from '@/lib/assistant/types'

export const runtime='nodejs'
export const maxDuration=180
export async function POST(req:Request,context:{params:Promise<{threadId:string}>}) {
  try {
    checkMutationRequest(req)
    const user=await requireApiUser()
    const threadId=z.string().uuid().parse((await context.params).threadId)
    const body=messageSchema.parse(await readBody(req))
    await requireAssistantThread(threadId,user.id)
    await expireAssistantRuns(threadId)
    if(!await startAssistantRun(threadId,user.id,body.requestId,body.message)) return Response.json(await getAssistantState(threadId,user))
    let attached=true
    const encoder=new TextEncoder()
    const stream=new ReadableStream({
      async start(controller) {
        const send=(event:AssistantEvent)=>{
          if(attached) {try {controller.enqueue(encoder.encode(JSON.stringify(event)+'\n'))} catch {attached=false}}
        }
        send({type:'progress',message:'相談内容を確認しています'})
        try {
          await runWorkspaceAssistant(threadId,body.requestId,user,message=>send({type:'progress',message}))
          send({type:'complete',state:await getAssistantState(threadId,user)})
        } catch(error) {
          send({type:'error',message:error instanceof AgentError?error.message:'回答を作成できませんでした。時間をおいて再送してください。'})
        } finally {if(attached) controller.close()}
      },
      cancel() {attached=false},
    })
    return new Response(stream,{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'}})
  } catch(error) {return apiError(error)}
}
