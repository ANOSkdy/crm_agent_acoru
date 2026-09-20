import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

async function main() {
  const fixture = JSON.parse(readFileSync('.local-test/fixture.json', 'utf8'))
  const base = 'http://localhost:3100'
  const headers = { 'Content-Type': 'application/json', Origin: base, Cookie: `acoru_session=${fixture.token}` }
  const url = `${base}/api/deals/${fixture.dealId}/agent`
  const before = await (await fetch(url, { headers })).json()
  assert.equal(before.context.objective, '受注')
  assert.match(before.context.current_strategy, /小規模/)
  assert.equal(before.decisions.length, 1)
  assert.match(before.decisions[0].rationale, /初期費用/)
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ requestId: randomUUID(), message: '保存済みの現在の方針と、その方針を採用した理由を教えてください。今回は相談のみで更新案は不要です。' }), signal: AbortSignal.timeout(170000) })
  assert.equal(response.status, 200)
  const after = await response.json()
  assert.equal(after.proposals.length, before.proposals.length)
  assert.equal(after.messages.length, before.messages.length + 2)
  assert.match(after.messages.at(-1).content, /小規模|段階/)
  assert.ok(after.messages.at(-1).sources.length)
  console.log('PASS: strategy and rationale persisted; later consultation used saved context and produced no unsolicited update proposal')
}
main().catch((error) => { console.error('Follow-up test failed', error instanceof Error ? error.message : 'unknown'); process.exitCode = 1 })
