import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'

config({ path: '.env.local', quiet: true })
async function main() {
  const fixture = JSON.parse(readFileSync('.local-test/fixture.json', 'utf8'))
  const base = 'http://localhost:3100'
  const headers = { 'Content-Type': 'application/json', Origin: base, Cookie: `acoru_session=${fixture.token}` }
  const url = `${base}/api/deals/${fixture.dealId}/agent`
  const response = await fetch(url, { headers })
  assert.equal(response.status, 200)
  const state = await response.json()
  const proposal = state.proposals[0]
  assert.ok(proposal, 'Live DeepSeek generated an update proposal')
  const sql = neon(process.env.DATABASE_URL!)
  if (process.argv[2] === 'after') {
    assert.equal(proposal.status, 'applied')
    assert.equal(state.context.current_summary, '提案内容に合意、見積準備中')
    const tasks = await sql`SELECT title FROM tasks WHERE deal_id = ${fixture.dealId}`
    assert.equal(tasks.length, 1)
    assert.equal(tasks[0].title, '見積を提出する（画面で修正）')
    const replay = await fetch(`${base}/api/agent/changes/${proposal.id}`, { method: 'POST', headers, body: JSON.stringify({ action: 'apply', operations: proposal.operations }) })
    assert.equal(replay.status, 200)
    const repeated = await replay.json()
    assert.equal(repeated.result.alreadyApplied, true)
    const counts = await sql`SELECT (SELECT count(*)::int FROM tasks WHERE deal_id = ${fixture.dealId}) AS tasks, (SELECT count(*)::int FROM activities WHERE deal_id = ${fixture.dealId}) AS activities, (SELECT count(*)::int FROM audit_logs WHERE target_id = ${fixture.dealId} AND action = 'agent_apply') AS audits`
    assert.deepEqual(counts[0], { tasks: 1, activities: 1, audits: 1 })
    console.log('PASS: edited proposal persisted, progress/task/activity applied, duplicate HTTP apply produced no duplicate records')
    return
  }
  assert.equal(proposal.status, 'pending')
  const counts = await sql`SELECT count(*)::int AS count FROM tasks WHERE deal_id = ${fixture.dealId}`
  assert.equal(counts[0].count, 0, 'No writes before approval')
  assert.equal((await fetch(url)).status, 401)
  assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, Origin: 'https://untrusted.invalid' }, body: '{}' })).status, 403)
  const viewerHeaders = { ...headers, Cookie: `acoru_session=${fixture.viewerToken}` }
  const viewer = await fetch(url, { headers: viewerHeaders })
  assert.equal((await viewer.json()).canEdit, false)
  assert.equal((await fetch(`${base}/api/agent/changes/${proposal.id}`, { method: 'POST', headers: viewerHeaders, body: JSON.stringify({ action: 'apply', operations: proposal.operations }) })).status, 403)
  assert.equal((await fetch(`${base}/api/agent/changes/${proposal.id}`, { method: 'POST', headers, body: JSON.stringify({ action: 'apply', operations: [{ type: 'delete_all' }] }) })).status, 400)
  const userMessage = state.messages.find((m: { role: string; run_id: string }) => m.role === 'user' && m.run_id === proposal.run_id)
  const replay = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ requestId: proposal.run_id, message: userMessage.content }) })
  assert.equal(replay.status, 200)
  assert.equal((await replay.json()).runs.length, state.runs.length)
  console.log('PASS: live proposal, no premature writes, unauthenticated/foreign-origin/viewer/invalid writes rejected, message replay idempotent')
}
main().catch((error) => { console.error('API test failed', error instanceof Error ? error.message : 'unknown'); process.exitCode = 1 })
