import 'server-only'
import { getSql, sql } from '@/lib/db'
import type { Deal, DealStage } from './deals'
import type { Activity } from './activities'
import type { Task } from './tasks'
import type { AgentMessage, AgentRun, ChangeRequest, DealContext, Decision, Source } from '@/lib/agent/types'
import type { ProposalInput, Operation } from '@/lib/agent/schema'
import { AgentError } from '@/lib/agent/errors'

export interface DealSnapshot {
  deal: Deal; company: { id: string; name: string; industry: string | null }
  context: DealContext | null; activities: Activity[]; tasks: Task[]; decisions: Decision[]; stages: DealStage[]
}
export async function getDealSnapshot(dealId: string): Promise<DealSnapshot> {
  // One SQL statement gives all related records a consistent snapshot.
  const rows = await sql`
    SELECT jsonb_build_object(
      'deal', to_jsonb(d), 'company', jsonb_build_object('id', c.id, 'name', c.name, 'industry', c.industry),
      'context', (SELECT to_jsonb(x) FROM deal_contexts x WHERE x.deal_id = d.id),
      'activities', (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (SELECT * FROM activities WHERE deal_id = d.id AND deleted_at IS NULL ORDER BY activity_date DESC LIMIT 30) x),
      'tasks', (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (SELECT * FROM tasks WHERE deal_id = d.id AND deleted_at IS NULL ORDER BY (status = 'done'), due_date NULLS LAST LIMIT 100) x),
      'decisions', (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (SELECT * FROM deal_decisions WHERE deal_id = d.id ORDER BY created_at DESC LIMIT 20) x),
      'stages', (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (SELECT * FROM deal_stages ORDER BY sort_order) x)
    ) AS snapshot
    FROM deals d JOIN companies c ON c.id = d.company_id WHERE d.id = ${dealId} AND d.deleted_at IS NULL`
  if (!rows[0]) throw new AgentError(404, '案件が見つかりません')
  return rows[0].snapshot as DealSnapshot
}
export async function getAgentData(dealId: string) {
  const db = getSql()
  const results = await db.transaction([
    db`SELECT * FROM deal_contexts WHERE deal_id = ${dealId}`,
    db`SELECT * FROM deal_decisions WHERE deal_id = ${dealId} ORDER BY created_at DESC LIMIT 30`,
    db`SELECT * FROM (SELECT m.*, u.name AS user_name FROM agent_messages m JOIN agent_threads t ON t.id = m.thread_id JOIN agent_runs r ON r.id = m.run_id LEFT JOIN users u ON u.id = r.user_id WHERE t.deal_id = ${dealId} ORDER BY m.created_at DESC, m.role ASC LIMIT 100) recent ORDER BY created_at ASC, role DESC`,
    db`SELECT c.id, c.run_id, c.status, c.reason, COALESCE(c.applied_operations, c.operations) AS operations, c.before_state, c.base_revision, c.created_at, c.applied_at
      FROM agent_change_requests c JOIN agent_runs r ON r.id=c.run_id JOIN agent_threads t ON t.id=r.thread_id
      WHERE t.deal_id=${dealId} AND c.deal_id=${dealId} ORDER BY c.created_at DESC LIMIT 50`,
    db`SELECT r.id, r.status, r.error_message, r.created_at FROM agent_runs r JOIN agent_threads t ON t.id = r.thread_id WHERE t.deal_id = ${dealId} ORDER BY r.created_at DESC LIMIT 20`,
  ])
  return {
    context: (results[0][0] ?? null) as DealContext | null,
    decisions: results[1] as unknown as Decision[], messages: results[2] as unknown as AgentMessage[],
    proposals: results[3] as unknown as ChangeRequest[], runs: results[4] as unknown as AgentRun[],
  }
}
export async function expireRuns(dealId: string) {
  await sql`UPDATE agent_runs SET status = 'failed', error_message = '処理が中断されました。必要であれば再送してください。', finished_at = now()
    WHERE thread_id IN (SELECT id FROM agent_threads WHERE deal_id = ${dealId}) AND status = 'running' AND created_at < now() - interval '3 minutes'`
}
export async function startRun(dealId: string, userId: string, requestId: string, input: string) {
  const existing = await sql`SELECT r.* FROM agent_runs r JOIN agent_threads t ON t.id = r.thread_id WHERE r.id = ${requestId} AND t.deal_id = ${dealId} AND r.user_id = ${userId}`
  if (existing.length) {
    if (existing[0].input !== input) throw new AgentError(409, '同じ送信IDの内容が異なります')
    return false
  }
  const db = getSql()
  const results = await db.transaction([
    db`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`,
    db`INSERT INTO agent_threads(deal_id, created_by) VALUES (${dealId}, ${userId}) ON CONFLICT (deal_id) DO NOTHING`,
    db`WITH new_run AS (
      INSERT INTO agent_runs(id, thread_id, user_id, input)
      SELECT ${requestId}::uuid, id, ${userId}::uuid, ${input} FROM agent_threads WHERE deal_id = ${dealId}
        AND (SELECT count(*) FROM agent_runs WHERE user_id = ${userId} AND created_at > now() - interval '1 hour') < 30
      ON CONFLICT DO NOTHING RETURNING id, thread_id
    ) INSERT INTO agent_messages(thread_id, run_id, role, content) SELECT thread_id, id, 'user', ${input} FROM new_run RETURNING run_id`,
  ])
  if (!results[2].length) {
    const replay = await sql`SELECT r.id FROM agent_runs r JOIN agent_threads t ON t.id = r.thread_id WHERE r.id = ${requestId} AND r.user_id = ${userId} AND r.input = ${input} AND t.deal_id = ${dealId}`
    if (replay.length) return false
    throw new AgentError(429, '別の相談を処理中、または1時間の利用上限（30回）に達しました。少し待ってから再送してください。')
  }
  return true
}
export async function finishRun(runId: string, dealId: string | null, snapshot: DealSnapshot | null, answer: string, sources: Source[], model: string, usage: Record<string, number>, proposal: ProposalInput | null) {
  const db = getSql()
  await db.transaction([
    db`UPDATE agent_runs SET status = 'completed', model = ${model}, usage = ${JSON.stringify(usage)}::jsonb, finished_at = now() WHERE id = ${runId} AND status = 'running'`,
    db`INSERT INTO agent_messages(thread_id, run_id, role, content, sources)
      SELECT thread_id, id, 'assistant', ${answer}, ${JSON.stringify(sources)}::jsonb FROM agent_runs WHERE id = ${runId} AND status = 'completed'
      ON CONFLICT (run_id, role) DO NOTHING`,
    ...(proposal && snapshot && dealId ? [db`INSERT INTO agent_change_requests(deal_id, run_id, reason, operations, before_state, base_revision)
      SELECT ${dealId}::uuid, id, ${proposal.reason}, ${JSON.stringify(proposal.operations)}::jsonb, ${JSON.stringify(snapshot)}::jsonb, ${snapshot.deal.agent_revision}
      FROM agent_runs WHERE id = ${runId} AND status = 'completed' ON CONFLICT (run_id) DO NOTHING`] : []),
  ])
}
export async function failRun(runId: string, message: string) {
  await sql`UPDATE agent_runs SET status = 'failed', error_message = ${message}, finished_at = now() WHERE id = ${runId} AND status = 'running'`
}
export async function getChange(changeId: string, userId: string) {
  const rows = await sql`SELECT c.* FROM agent_change_requests c JOIN agent_runs r ON r.id=c.run_id JOIN agent_threads t ON t.id=r.thread_id
    WHERE c.id = ${changeId} AND (t.deal_id IS NOT NULL OR t.created_by=${userId})`
  if (!rows[0]) throw new AgentError(404, '更新案が見つかりません')
  return rows[0] as unknown as ChangeRequest & { deal_id: string }
}
export async function applyChanges(changeId: string, userId: string, operations: Operation[]) {
  const rows = await sql`SELECT apply_agent_changes(${changeId}::uuid, ${userId}::uuid, ${JSON.stringify(operations)}::jsonb) AS result`
  return rows[0].result
}
export async function rejectChange(changeId: string, userId: string) {
  await sql`UPDATE agent_change_requests SET status = 'rejected', reviewed_by = ${userId} WHERE id = ${changeId} AND status = 'pending'`
}
