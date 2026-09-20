import { notFound } from 'next/navigation'
import { z } from 'zod'
import { requireCurrentUser } from '@/lib/auth/session'
import { getAssistantState, listAssistantThreads } from '@/lib/db/queries/assistant'
import { getDealById } from '@/lib/db/queries/deals'
import { AgentError } from '@/lib/agent/errors'
import { AssistantWorkspace } from '@/components/assistant/AssistantWorkspace'

export const dynamic='force-dynamic'
export const metadata={title:'Acoru AI | CRMアシスタント'}
export default async function AssistantPage({params,searchParams}:{params:Promise<{thread?:string[]}>;searchParams:Promise<{deal?:string}>}) {
  const user=await requireCurrentUser()
  const {thread}=await params
  if(thread && (thread.length!==1 || !z.string().uuid().safeParse(thread[0]).success)) notFound()
  const threadId=thread?.[0]
  const [history,state]=await Promise.all([listAssistantThreads(user.id),threadId?getAssistantState(threadId,user).catch(error=>{if(error instanceof AgentError&&error.status===404)notFound();throw error}):null])
  const {deal:dealId}=await searchParams
  const deal=!threadId && z.string().uuid().safeParse(dealId).success ? await getDealById(dealId!):null
  return <AssistantWorkspace key={threadId??'new'} userName={user.name} initialHistory={history} initialState={state} initialMessage={deal?`「${deal.title}」の状況を整理して、次に進めることを相談したいです。\n対象案件: /deals/${deal.id}`:''} />
}
