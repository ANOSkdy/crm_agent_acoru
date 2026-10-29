// Test-process preload; blocks all external traffic and routes only the synthetic DB to PGlite.
const endpoint = process.env.TASK_BROWSER_FIXTURE
if (!endpoint || !/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error('Isolated issue fixture required')
const nativeFetch = globalThis.fetch.bind(globalThis)
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url)
  const connection = new Headers(init?.headers).get('Neon-Connection-String')
  if (connection === 'postgresql://fixture:fixture@task-fixture.neon.tech/fixture') {
    return nativeFetch(endpoint, { ...init, headers: { 'Content-Type': 'application/json', 'x-fixture': process.env.TASK_BROWSER_NONCE } })
  }
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return nativeFetch(input, init)
  throw new Error('External network blocked by issue fixture')
}
