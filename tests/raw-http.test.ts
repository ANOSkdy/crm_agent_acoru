import test from 'node:test'
import assert from 'node:assert/strict'
import { sameOrigin,rawBody } from '../lib/raw/http'
import { rawError,requireRawFlag } from '../lib/raw/server'
import { checkMutationRequest } from '../lib/http/api'
test('shared mutations accept the actual same-origin Host and reject cross-site requests',()=>{
 const request=(headers:Record<string,string>)=>new Request('http://localhost:4000/api/bulk-mail',{method:'POST',headers:{'content-type':'application/json',...headers}})
 checkMutationRequest(request({host:'127.0.0.1:4000',origin:'http://127.0.0.1:4000'}))
 for(const headers of [{host:'127.0.0.1:4000',origin:'http://evil.example'},{host:'127.0.0.1:4000'},{host:'127.0.0.1:4000',origin:'http://evil.example','x-forwarded-host':'evil.example'},{host:'127.0.0.1:4000',origin:'http://127.0.0.1:4000','sec-fetch-site':'cross-site'}] as Record<string,string>[])assert.throws(()=>checkMutationRequest(request(headers)),{status:403})
 assert.throws(()=>checkMutationRequest(request({origin:'http://localhost:4000','content-type':'text/plain'})),{status:415})
})
test('Host-aware same-origin rejects cross-site, missing origin and forged forwarded host',()=>{
 sameOrigin(new Request('http://localhost:4000/api/raw/documents',{headers:{host:'127.0.0.1:4000',origin:'http://127.0.0.1:4000'}}))
 for(const headers of [{host:'crm.example',origin:'https://evil.example'}, {host:'crm.example'}, {host:'crm.example',origin:'https://evil.example','x-forwarded-host':'evil.example'},{host:'crm.example',origin:'https://crm.example','sec-fetch-site':'cross-site'}] as Record<string,string>[])assert.throws(()=>sameOrigin(new Request('https://crm.example/api/raw/documents',{headers})),{status:403})
})
test('JSON body limits/UTF8 fail closed; error/log boundary never exposes exception details',async()=>{
 const request=(body:Uint8Array|string)=>new Request('https://crm.example/api/raw/documents',{method:'POST',headers:{'Content-Type':'application/json'},body:body as BodyInit})
 await assert.rejects(rawBody(request(new Uint8Array([123,34,120,34,58,34,255,34,125]))),{status:400})
 await assert.rejects(rawBody(request('{"long":"0123456789"}'),10),{status:413})
 const response=rawError(new Error('SECRET database password and customer body'));assert.equal(JSON.stringify(await response.json()).includes('SECRET'),false)
 const before=process.env.RAW_APPLY_ENABLED;process.env.RAW_APPLY_ENABLED='false'
 try{assert.throws(()=>requireRawFlag('apply'),{status:503})}finally{if(before===undefined)delete process.env.RAW_APPLY_ENABLED;else process.env.RAW_APPLY_ENABLED=before}
})

import { rawBatches,RAW_BATCH_BYTES } from '../lib/raw/batch'
test('maximum-size upload/sync batches stay under the transport budget and preserve all files',()=>{
 const docs=Array.from({length:20},(_,i)=>({source_key:String(i),content:'x'.repeat(256*1024)}))
 const batches=rawBatches(docs)
 assert.equal(batches.flat().length,20)
 assert.ok(batches.length>1)
 assert.ok(batches.every(batch=>new TextEncoder().encode(JSON.stringify({documents:batch})).length<=RAW_BATCH_BYTES))
})
