import 'server-only'
import { getSql, sql } from '@/lib/db'
import { AgentError } from '@/lib/agent/errors'
import { canEditDeal } from '@/lib/auth/deal-permissions'
import type { AppUser } from './users'
import type { AssistantState, AssistantThread } from '@/lib/assistant/types'
import type { AgentMessage } from '@/lib/agent/types'

export async function listAssistantThreads(userId: string, query = '', offset = 0) {
  const pattern = '%' + query.replace(/[\\%_]/g, '\\$&') + '%'
  const rows = await sql`SELECT t.id,t.title,t.updated_at,t.deal_id FROM agent_threads t
    WHERE (t.created_by=${userId} OR t.deal_id IS NOT NULL)
      AND (t.deal_id IS NULL OR EXISTS(SELECT 1 FROM crm_ai_records r WHERE r.kind='deal' AND r.id=t.deal_id))
      AND (t.title ILIKE ${pattern} OR EXISTS(SELECT 1 FROM agent_messages m WHERE m.thread_id=t.id AND m.content ILIKE ${pattern}))
    ORDER BY t.updated_at DESC,t.id DESC LIMIT 41 OFFSET ${offset}`
  return { threads: rows.slice(0,40) as unknown as AssistantThread[], hasMore: rows.length>40 }
}
export async function requireAssistantThread(threadId: string, userId: string) {
  const rows = await sql`SELECT t.id,t.title,t.updated_at,t.deal_id,t.created_by FROM agent_threads t
    WHERE t.id=${threadId} AND (t.created_by=${userId} OR t.deal_id IS NOT NULL)
    AND (t.deal_id IS NULL OR EXISTS(SELECT 1 FROM crm_ai_records r WHERE r.kind='deal' AND r.id=t.deal_id))`
  if (!rows.length) throw new AgentError(404,'会話が見つかりません')
  return rows[0] as unknown as AssistantThread & { created_by: string }
}
export async function createAssistantThread(userId: string, title: string) {
  const rows = await sql`INSERT INTO agent_threads(created_by,title) VALUES(${userId},${title}) RETURNING id,title,updated_at,deal_id`
  return rows[0] as unknown as AssistantThread
}
export async function renameAssistantThread(threadId: string, userId: string, title: string) {
  const rows = await sql`UPDATE agent_threads SET title=${title},updated_at=now() WHERE id=${threadId} AND created_by=${userId} AND deal_id IS NULL RETURNING id`
  if (!rows.length) throw new AgentError(404,'会話が見つかりません')
}
export async function expireAssistantRuns(threadId: string) {
  await sql`UPDATE agent_runs SET status='failed',error_message='処理が中断されました。もう一度送信してください。',finished_at=now()
    WHERE thread_id=${threadId} AND status='running' AND created_at<now()-interval '3 minutes'`
}
export async function getAssistantState(threadId: string, user: AppUser, before: string | null = null): Promise<AssistantState> {
  const thread = await requireAssistantThread(threadId,user.id)
  await expireAssistantRuns(threadId)
  const db=getSql()
  const results = await db.transaction([
    db`SELECT m.*,u.name AS user_name FROM agent_messages m JOIN agent_runs r ON r.id=m.run_id LEFT JOIN users u ON u.id=r.user_id
      WHERE m.thread_id=${threadId} AND (${before}::uuid IS NULL OR (m.created_at,m.id)<(SELECT created_at,id FROM agent_messages WHERE id=${before}::uuid AND thread_id=${threadId}))
      ORDER BY m.created_at DESC,m.id DESC LIMIT 61`,
    db`SELECT c.id,c.run_id,c.deal_id,d.title AS deal_title,d.owner_user_id,c.status,c.reason,coalesce(c.applied_operations,c.operations) AS operations,c.before_state,c.base_revision,c.created_at,c.applied_at
      FROM agent_change_requests c JOIN agent_runs r ON r.id=c.run_id JOIN deals d ON d.id=c.deal_id WHERE r.thread_id=${threadId}
      AND c.run_id IN (SELECT m.run_id FROM agent_messages m WHERE m.thread_id=${threadId}
        AND (${before}::uuid IS NULL OR (m.created_at,m.id)<(SELECT created_at,id FROM agent_messages WHERE id=${before}::uuid AND thread_id=${threadId})) ORDER BY m.created_at DESC,m.id DESC LIMIT 60)
      ORDER BY c.created_at DESC`,
    db`SELECT id,status,error_message,progress,created_at FROM agent_runs WHERE thread_id=${threadId} ORDER BY created_at DESC LIMIT 10`,
  ])
  return { thread, messages: results[0].slice(0,60).reverse() as unknown as AgentMessage[], hasOlder: results[0].length>60,
    proposals: results[1].map((row)=>({...row,canEdit:canEditDeal(user,{owner_user_id:row.owner_user_id as string|null})})) as unknown as AssistantState['proposals'],
    runs:results[2] as unknown as AssistantState['runs'] }
}
export async function startAssistantRun(threadId: string, userId: string, requestId: string, input: string) {
  const thread=await requireAssistantThread(threadId,userId)
  if(thread.deal_id) throw new AgentError(400,'過去の案件会話は閲覧専用です。新しいチャットで続けてください。')
  const existing=await sql`SELECT id,input FROM agent_runs WHERE id=${requestId} AND thread_id=${threadId} AND user_id=${userId}`
  if(existing.length) {
    if(existing[0].input!==input) throw new AgentError(409,'同じ送信IDの内容が異なります')
    return false
  }
  const db=getSql()
  const results=await db.transaction([
    db`SELECT pg_advisory_xact_lock(hashtextextended(${userId},0))`,
    db`WITH new_run AS (
      INSERT INTO agent_runs(id,thread_id,user_id,input,progress)
      SELECT ${requestId}::uuid,t.id,${userId}::uuid,${input},'相談内容を確認しています' FROM agent_threads t
      WHERE t.id=${threadId} AND t.created_by=${userId} AND t.deal_id IS NULL
        AND (SELECT count(*) FROM agent_runs WHERE user_id=${userId} AND created_at>now()-interval '1 hour')<30
      ON CONFLICT DO NOTHING RETURNING id,thread_id
    ) INSERT INTO agent_messages(thread_id,run_id,role,content) SELECT thread_id,id,'user',${input} FROM new_run RETURNING run_id`,
    db`UPDATE agent_threads SET updated_at=now() WHERE id=${threadId} AND created_by=${userId}`,
  ])
  if(!results[1].length) {
    const replay=await sql`SELECT id FROM agent_runs WHERE id=${requestId} AND thread_id=${threadId} AND user_id=${userId} AND input=${input}`
    if(replay.length) return false
    throw new AgentError(429,'この会話を処理中、または1時間の上限（30回）に達しました。しばらくしてから送信してください。')
  }
  return true
}
export async function recordAssistantProgress(runId: string, progress: string, trace: unknown[], usage: Record<string,number>, model: string) {
  await sql`UPDATE agent_runs SET progress=${progress},tool_trace=${JSON.stringify(trace)}::jsonb,usage=${JSON.stringify(usage)}::jsonb,model=${model} WHERE id=${runId} AND status='running'`
}
export async function searchConversation(threadId: string, query: string) {
  const pattern='%'+query.replace(/[\\%_]/g,'\\$&')+'%'
  return await sql`SELECT role,left(content,4000) AS content,created_at FROM agent_messages WHERE thread_id=${threadId} AND content ILIKE ${pattern} ORDER BY created_at DESC LIMIT 15`
}
