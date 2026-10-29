// Test-process preload only. Never imported by the application.
const endpoint=process.env.RAW_BROWSER_FIXTURE
if(!endpoint || !/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint))throw new Error('Isolated browser fixture required')
const nativeFetch=globalThis.fetch.bind(globalThis)
globalThis.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url)
 const connection=new Headers(init?.headers).get('Neon-Connection-String')
 if(connection==='postgresql://fixture:fixture@raw-fixture.neon.tech/fixture' || url.hostname==='api.deepseek.com'){
  return nativeFetch(endpoint+(url.hostname==='api.deepseek.com'?'/ai':'/sql'),{...init,headers:{'Content-Type':'application/json','x-fixture':process.env.RAW_BROWSER_NONCE}})
 }
 if(['localhost','127.0.0.1','[::1]'].includes(url.hostname))return nativeFetch(input,init)
 throw new Error('External network blocked by isolated browser fixture')
}
