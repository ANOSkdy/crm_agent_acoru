import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveEvidence } from '../lib/assistant/evidence'
import { searchSchema, metricsSchema, answerSchema } from '../lib/assistant/schema'

const sources=new Map([['S1',{id:'S1',label:'確認済みの案件',href:'/deals/known'}]])
test('only retrieved evidence can be cited, with matching body references',()=>{
  assert.equal(resolveEvidence('現状です [S1]',['S1','S1'],sources).length,1)
  assert.throws(()=>resolveEvidence('架空の案件 [S2]',['S2'],sources))
  assert.throws(()=>resolveEvidence('本文だけ架空 [S2]',['S1'],sources))
  assert.throws(()=>resolveEvidence('根拠なし',[],sources))
})
test('CRM tools reject unrestricted tables, invalid dates, malformed IDs and oversized pages',()=>{
  assert.equal(searchSchema.parse({query:'顧客'}).offset,0)
  assert.equal(searchSchema.safeParse({entity:'users'}).success,false)
  assert.equal(searchSchema.safeParse({query:'',sql:'DROP TABLE users'}).success,false)
  assert.equal(searchSchema.safeParse({company_id:'invalid'}).success,false)
  assert.equal(searchSchema.safeParse({offset:10001}).success,false)
  assert.equal(metricsSchema.safeParse({close_from:'2026-02-30'}).success,false)
})
test('workspace proposals must identify a specific deal',()=>{
  const proposal={reason:'依頼された更新',operations:[{type:'create_task',title:'確認する',description:'',due_date:null,priority:'high'}]}
  assert.equal(answerSchema.safeParse({answer:'確認してください [S1]',source_ids:['S1'],proposal}).success,false)
  assert.equal(answerSchema.safeParse({answer:'確認してください [S1]',source_ids:['S1'],proposal:{...proposal,deal_id:'00000000-0000-4000-8000-000000000001'}}).success,true)
})
