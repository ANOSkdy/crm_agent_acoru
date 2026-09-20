import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
config({path:'.env.local',quiet:true})
async function main() {
  const fixture=JSON.parse(readFileSync('.local-test/fixture.json','utf8'))
  const sql=neon(process.env.DATABASE_URL!)
  const base='http://localhost:3000'
  const headers={'Content-Type':'application/json',Origin:base,Cookie:`acoru_session=${fixture.token}`}
  const viewer={...headers,Cookie:`acoru_session=${fixture.viewerToken}`}
  const threads=await sql`SELECT t.id FROM agent_threads t WHERE t.created_by=${fixture.userId} AND t.deal_id IS NULL AND EXISTS(SELECT 1 FROM agent_messages WHERE thread_id=t.id) ORDER BY t.updated_at DESC LIMIT 1`
  assert.ok(threads[0])
  const url=`${base}/api/assistant/threads/${threads[0].id}`
  const response=await fetch(url,{headers})
  assert.equal(response.status,200)
  const state=await response.json()
  assert.ok(state.messages.some((message:{role:string})=>message.role==='assistant'),'AI answer saved')
  const mode=process.argv[2]??'read'
  if(mode==='read') {
    const answer=state.messages.filter((message:{role:string})=>message.role==='assistant').at(-1)
    assert.ok(answer.sources.some((source:{href:string})=>source.href===`/deals/${fixture.dealId}`),'First deal cited')
    assert.ok(answer.sources.some((source:{href:string})=>source.href===`/deals/${fixture.otherDealId}`),'Other company deal cited')
    assert.match(answer.content,/(500,?000|50万)/)
    assert.match(answer.content,/(900,?000|90万)/)
    assert.equal(state.proposals.length,0)
    assert.equal((await fetch(url)).status,401)
    assert.equal((await fetch(url,{headers:viewer})).status,404)
    assert.equal((await fetch(url,{method:'PATCH',headers:viewer,body:JSON.stringify({title:'Unauthorized'})})).status,404)
    assert.equal((await fetch(`${url}/messages`,{method:'POST',headers:viewer,body:JSON.stringify({requestId:crypto.randomUUID(),message:'他人の会話を読んで'})})).status,404)
    const history=await (await fetch(`${base}/api/assistant/threads`,{headers:viewer})).json()
    assert.ok(!history.threads.some((thread:{id:string})=>thread.id===threads[0].id))
    assert.equal((await fetch(`${url}/messages`,{method:'POST',headers:{...headers,Origin:'https://untrusted.invalid'},body:'{}'})).status,403)
    assert.equal((await fetch(`${url}/messages`,{method:'POST',headers,body:JSON.stringify({requestId:'bad',message:'invalid'})})).status,400)
    const userMessage=state.messages.filter((message:{role:string})=>message.role==='user').at(-1)
    const replay=await fetch(`${url}/messages`,{method:'POST',headers,body:JSON.stringify({requestId:userMessage.run_id,message:userMessage.content})})
    assert.equal(replay.status,200)
    assert.equal((await replay.json()).messages.length,state.messages.length)
    console.log('PASS: two-company comparison, correct amounts and citations, saved history, private-thread isolation, CSRF, invalid input, idempotent send')
    return
  }
  const proposal=state.proposals[0]
  assert.ok(proposal)
  assert.equal(proposal.deal_id,fixture.dealId,'Only the requested deal is targeted')
  const contexts=await sql`SELECT * FROM deal_contexts WHERE deal_id IN (${fixture.dealId},${fixture.otherDealId})`
  const tasks=await sql`SELECT deal_id,title FROM tasks WHERE deal_id IN (${fixture.dealId},${fixture.otherDealId})`
  assert.ok(!contexts.some(context=>context.deal_id===fixture.otherDealId))
  assert.ok(!tasks.some(task=>task.deal_id===fixture.otherDealId))
  if(mode==='before') {
    assert.equal(proposal.status,'pending')
    assert.equal(contexts.length,0)
    assert.equal(tasks.length,1,'No writes before confirmation')
    const legacy=await (await fetch(`${base}/api/deals/${fixture.dealId}/agent`,{headers:viewer})).json()
    assert.ok(!legacy.proposals.some((item:{id:string})=>item.id===proposal.id),'Legacy deal API does not expose private proposals')
    assert.equal((await fetch(`${base}/api/agent/changes/${proposal.id}`,{method:'POST',headers:viewer,body:JSON.stringify({action:'apply',operations:proposal.operations})})).status,404)
    console.log('PASS: requested deal selected, other company unchanged, no writes before confirmation, private proposal protected')
    return
  }
  assert.equal(proposal.status,'applied')
  assert.equal(contexts[0].current_summary,'提案内容に合意、見積準備中')
  assert.ok(tasks.some(task=>task.title==='見積を提出する（画面で確認）'))
  assert.equal(tasks.length,2)
  const repeated=await fetch(`${base}/api/agent/changes/${proposal.id}`,{method:'POST',headers,body:JSON.stringify({action:'apply',operations:proposal.operations})})
  assert.equal(repeated.status,200)
  assert.equal((await repeated.json()).result.alreadyApplied,true)
  console.log('PASS: edited proposal applied to the chosen deal only, persisted progress and task, idempotent apply')
}
main().catch(error=>{console.error('Assistant API verification failed',error instanceof Error?error.message:'unknown');process.exitCode=1})
