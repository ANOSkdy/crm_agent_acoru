import test from 'node:test'
import assert from 'node:assert/strict'
import { localAuthEnabled, localLoginRequest } from '../lib/auth/local-policy'
import { LocalAuthSessions, LOCAL_SESSION_SECONDS, matchesLocalKey } from '../lib/auth/local-auth'

const enabled = { NODE_ENV: 'development', LOCAL_AUTH_ENABLED: 'true', LOCAL_AUTH_KEY: 'local-test-key' }

test('fixed local key requires development, explicit opt-in and an exact loopback host', () => {
  for (const host of ['127.0.0.1:3000', 'localhost:3000', '[::1]:3000']) assert.equal(localAuthEnabled(enabled, host), true)
  for (const host of [null, '', 'example.com', 'localhost.example.com:3000', '127.0.0.1.example.com:3000', 'user@localhost:3000', 'localhost:3000/path', 'localhost:bad', '192.168.1.1:3000']) assert.equal(localAuthEnabled(enabled, host), false)
  for (const override of [{ NODE_ENV: 'production' }, { NODE_ENV: 'test' }, { LOCAL_AUTH_ENABLED: 'false' }, { LOCAL_AUTH_KEY: '' }, { VERCEL: '1' }, { VERCEL_ENV: 'production' }, { VERCEL_ENV: 'preview' }]) assert.equal(localAuthEnabled({ ...enabled, ...override }, 'localhost:3000'), false)
})

test('local login rejects missing, cross-site, and forged origins', () => {
  assert.equal(localLoginRequest(enabled, '127.0.0.1:3000', 'http://127.0.0.1:3000', 'same-origin'), true)
  for (const origin of [null, 'http://localhost:3000', 'https://attacker.example', 'http://127.0.0.1:3000/path']) assert.equal(localLoginRequest(enabled, '127.0.0.1:3000', origin, 'same-origin'), false)
  assert.equal(localLoginRequest(enabled, '127.0.0.1:3000', 'http://127.0.0.1:3000', 'cross-site'), false)
  assert.equal(localLoginRequest({ ...enabled, NODE_ENV: 'production' }, '127.0.0.1:3000', 'http://127.0.0.1:3000', 'same-origin'), false)
})

test('local key matches exactly and never accepts empty, wrong, or oversized input', () => {
  assert.equal(matchesLocalKey('local-test-key', 'local-test-key'), true)
  for (const value of [null, 1234, '', ' local-test-key', 'local-test-key ', 'wrong', 'x'.repeat(129)]) assert.equal(matchesLocalKey(value, 'local-test-key'), false)
  assert.equal(matchesLocalKey('', ''), false)
})

test('local sessions use opaque tokens, expire, revoke and invalidate on key changes or restart', () => {
  let now = 1000
  const store = new LocalAuthSessions(() => now)
  const token = store.create('admin-id', 'local-test-key')
  assert.match(token, /^[\w-]{43}$/)
  assert.notEqual(token, 'local-test-key')
  assert.equal(store.userId(token, 'local-test-key'), 'admin-id')
  assert.equal(store.userId(token, 'new-key'), null)
  assert.equal(store.userId('made-up-token', 'local-test-key'), null)
  assert.equal(new LocalAuthSessions().userId(token, 'local-test-key'), null)
  now += LOCAL_SESSION_SECONDS * 1000
  assert.equal(store.userId(token, 'local-test-key'), null)
  const next = store.create('admin-id', 'local-test-key')
  store.revoke(next)
  assert.equal(store.userId(next, 'local-test-key'), null)
})

test('local login attempts are limited and reset after the window', () => {
  let now = 1000
  const store = new LocalAuthSessions(() => now)
  for (let i = 0; i < 10; i++) assert.equal(store.attempt(), true)
  assert.equal(store.attempt(), false)
  now += 300000
  assert.equal(store.attempt(), true)
  store.create('admin-id', 'local-test-key')
  assert.equal(store.attempt(), true)
})
