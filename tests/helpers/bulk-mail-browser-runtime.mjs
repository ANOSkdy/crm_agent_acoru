// Isolated browser-test process only; never imported by the application.
import Module, { createRequire, registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
const endpoint = process.env.MAIL_BROWSER_FIXTURE
if (!endpoint || !/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error('Isolated mail fixture required')
const nativeFetch = globalThis.fetch.bind(globalThis)

// Exercise the real production repository/transaction adapter against the
// isolated PGlite fixture. No WebSocket can reach an external database.
class FixturePool {
  constructor(options) {
    if (options.connectionString !== 'postgresql://fixture:fixture@mail-fixture.neon.tech/fixture') throw new Error('Non-fixture pool blocked')
  }
  async connect() {
    return { query: async (query, params = []) => {
      const response = await nativeFetch(endpoint + '/pg', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-fixture': process.env.MAIL_BROWSER_NONCE }, body: JSON.stringify({ query, params }) })
      if (!response.ok) throw new Error('Fixture transaction query failed')
      return response.json()
    }, release() {} }
  }
  async end() {}
}
globalThis.__bulkMailFixturePool = FixturePool
const realNeonUrl = pathToFileURL(createRequire(import.meta.url).resolve('@neondatabase/serverless').replace(/index\.js$/, 'index.mjs')).href
const fixtureNeonUrl = 'data:text/javascript,' + encodeURIComponent(`export * from ${JSON.stringify(realNeonUrl)}; export const Pool = globalThis.__bulkMailFixturePool;`)
registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@neondatabase/serverless' && context.conditions.includes('import')) return { url: fixtureNeonUrl, shortCircuit: true }
  return next(specifier, context)
} })
const nativeLoad = Module._load
Module._load = function (request, ...args) {
  const loaded = nativeLoad.call(this, request, ...args)
  return request === '@neondatabase/serverless' ? { ...loaded, Pool: FixturePool } : loaded
}
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url)
  const connection = new Headers(init?.headers).get('Neon-Connection-String')
  if (connection === 'postgresql://fixture:fixture@mail-fixture.neon.tech/fixture') {
    return nativeFetch(endpoint + '/sql', { ...init, headers: { 'Content-Type': 'application/json', 'x-fixture': process.env.MAIL_BROWSER_NONCE } })
  }
  if (url.href === 'https://api.resend.com/emails' && new Headers(init?.headers).get('Authorization') === 'Bearer browser-fixture-key-not-real') {
    return nativeFetch(endpoint + '/email', { ...init, headers: { 'Content-Type': 'application/json', 'x-fixture': process.env.MAIL_BROWSER_NONCE, 'Idempotency-Key': new Headers(init?.headers).get('Idempotency-Key') } })
  }
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return nativeFetch(input, init)
  throw new Error('External network blocked by isolated mail fixture')
}
