import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import {
  authenticator,
  decryptSecret,
  encryptSecret,
  encryptionKey,
  newSecret,
  safeReturnTo,
  tokenHash,
  verifyCode,
} from '../lib/auth/mfa-crypto'
import { MfaRepository } from '../lib/auth/mfa-repository'

test('OTP-only login is pinned to one user, consumes each step once and stops disabled users', async () => {
  const { db, user, repo } = await setup()
  try {
    assert.equal(await repo.otpCredential(user), undefined)
    await db.query(
      'INSERT INTO auth_mfa_credentials(user_id,environment,secret_encrypted) VALUES ($1,$2,$3)',
      [user, 'preview', 'encrypted'],
    )
    const credential = (await repo.otpCredential(user))!
    assert.equal(await repo.otpCredential(randomUUID()), undefined)
    const results = await Promise.all([
      repo.completeOtp(
        user,
        credential.version,
        100,
        tokenHash('otp-one'),
        null,
        null,
      ),
      repo.completeOtp(
        user,
        credential.version,
        100,
        tokenHash('otp-two'),
        null,
        null,
      ),
    ])
    assert.equal(results.filter(Boolean).length, 1)
    assert.equal((await db.query('SELECT * FROM user_sessions')).rows.length, 1)
    await db.query('UPDATE users SET is_active=false WHERE id=$1', [user])
    assert.equal(await repo.otpCredential(user), undefined)
    assert.equal(
      await repo.completeOtp(
        user,
        credential.version,
        101,
        tokenHash('disabled'),
        null,
        null,
      ),
      false,
    )
  } finally {
    await db.close()
  }
})

async function setup() {
  const db = new PGlite()
  await db.exec(`CREATE TABLE users(id uuid PRIMARY KEY, login_id text, is_active boolean DEFAULT true, locked_until timestamptz, failed_login_count integer DEFAULT 0, last_login_at timestamptz, updated_at timestamptz);
    CREATE TABLE user_sessions(id uuid DEFAULT gen_random_uuid(), user_id uuid, token_hash text UNIQUE, expires_at timestamptz, created_at timestamptz DEFAULT now(), user_agent text, ip_address text, revoked_at timestamptz);
    CREATE TABLE audit_logs(user_id uuid, action text, target_type text, after_json jsonb);`)
  await db.exec(
    await readFile('scripts/db/migrations/005_user_mfa.sql', 'utf8'),
  )
  const user = randomUUID()
  await db.query('INSERT INTO users(id, login_id) VALUES ($1, $2)', [
    user,
    'test',
  ])
  const repo = new MfaRepository(
    {
      query: async (text, params) =>
        (await db.query(text, params)).rows as Record<string, unknown>[],
    },
    'preview',
  )
  return { db, user, repo }
}

test('RFC 6238 SHA1, six digits, adjacent steps and expired codes', () => {
  // RFC 6238 Appendix B: ASCII 12345678901234567890, 59s -> 94287082 (8 digits).
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
  assert.equal(
    authenticator(secret, 'test').generate({ timestamp: 59000 }),
    '287082',
  )
  assert.equal(verifyCode(secret, '287082', 59000), 1)
  assert.equal(verifyCode(secret, '287082', 89000), 1)
  assert.equal(verifyCode(secret, '287082', 119000), null)
  assert.equal(verifyCode(secret, '287082', 29000), 1)
  for (const invalid of [
    '28708',
    '2870820',
    '２８７０８２',
    ' 287082',
    null,
    287082,
  ])
    assert.equal(verifyCode(secret, invalid, 59000), null)
})

test('secrets are authenticated, user/environment-bound, and config fails closed', () => {
  const key = encryptionKey(randomBytes(32).toString('base64'))
  const secret = newSecret()
  const value = encryptSecret(secret, 'preview:userA', key)
  assert.equal(decryptSecret(value, 'preview:userA', key), secret)
  assert.ok(!value.includes(secret))
  assert.throws(() => decryptSecret(value, 'preview:userB', key))
  assert.throws(() => decryptSecret(value, 'production:userA', key))
  assert.throws(() => decryptSecret(value, 'preview:userA', randomBytes(32)))
  const parts = value.split('.')
  parts[2] = Buffer.from('tampered').toString('base64url')
  assert.throws(() => decryptSecret(parts.join('.'), 'preview:userA', key))
  for (const invalid of ['', 'short', 'a'.repeat(44)])
    assert.throws(() => encryptionKey(invalid))
})

test('return destination stays on this application', () => {
  assert.equal(
    safeReturnTo('/billing?period=2026-09'),
    '/billing?period=2026-09',
  )
  for (const value of [
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    '/\nevil.test',
    '/login/verify',
    null,
  ])
    assert.equal(safeReturnTo(value), '/dashboard')
})

test('enrollment consumes OTP once, creates only an MFA session, and isolates environments', async () => {
  const { db, user, repo } = await setup()
  try {
    const token = await repo.begin(user, 'encrypted-value', '/billing')
    assert.equal((await db.query('SELECT * FROM user_sessions')).rows.length, 0)
    assert.equal((await repo.challenge(token))?.purpose, 'enroll')
    const local = new MfaRepository(
      {
        query: async (q, p) =>
          (await db.query(q, p)).rows as Record<string, unknown>[],
      },
      'local',
    )
    assert.equal(await local.challenge(token), null)
    const challenge = (await repo.challenge(token, true))!
    assert.equal(
      await repo.complete(challenge, 100, tokenHash('session1'), null, null),
      true,
    )
    assert.equal(
      await repo.complete(challenge, 100, tokenHash('session2'), null, null),
      false,
    )
    assert.equal(await repo.challenge(token), null)
    const session = (
      await db.query(
        'SELECT *, expires_at-created_at AS duration FROM user_sessions',
      )
    ).rows[0] as Record<string, unknown>
    assert.equal(session.auth_environment, 'preview')
    assert.equal(session.mfa_version, challenge.credential_version)
    assert.equal((await db.query('SELECT * FROM audit_logs')).rows.length, 1)
    const otherToken = await repo.begin(user, 'must-not-replace', '/billing')
    const other = (await repo.challenge(otherToken, true))!
    assert.equal(other.purpose, 'verify')
    assert.equal(other.secret_encrypted, 'encrypted-value')
    assert.equal(
      await repo.complete(other, 100, tokenHash('session3'), null, null),
      false,
    )
    assert.equal(
      await repo.complete(other, 101, tokenHash('session4'), null, null),
      true,
    )
  } finally {
    await db.close()
  }
})

test('concurrent challenges accept a time step only once; incomplete enrollments cannot reveal confirmed secrets', async () => {
  const { db, user, repo } = await setup()
  try {
    const tokens = await Promise.all([
      repo.begin(user, 'a', '/billing'),
      repo.begin(user, 'b', '/billing'),
    ])
    const challenges = await Promise.all(
      tokens.map((t) => repo.challenge(t, true)),
    )
    assert.equal(
      challenges[0]!.secret_encrypted,
      challenges[1]!.secret_encrypted,
    )
    const results = await Promise.all(
      challenges.map((c, i) =>
        repo.complete(c!, 100, tokenHash(`session${i}`), null, null),
      ),
    )
    assert.equal(results.filter(Boolean).length, 1)
    assert.equal(await repo.challenge(tokens[0]), null)
    assert.equal(await repo.challenge(tokens[1]), null)
  } finally {
    await db.close()
  }
})

test('challenge expiry, five attempts, disabled users, and credential reset all deny completion', async () => {
  const { db, user, repo } = await setup()
  try {
    const token = await repo.begin(user, 'a', '/billing')
    for (let i = 0; i < 5; i++) assert.ok(await repo.challenge(token, true))
    assert.equal(await repo.challenge(token, true), null)
    const expired = await repo.begin(user, 'a', '/billing')
    await db.query(
      "UPDATE auth_login_challenges SET expires_at = now() - interval '1 second' WHERE token_hash = $1",
      [tokenHash(expired)],
    )
    assert.equal(await repo.challenge(expired, true), null)
    const good = await repo.begin(user, 'a', '/billing')
    const challenge = (await repo.challenge(good, true))!
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [user])
    assert.equal(
      await repo.complete(challenge, 100, tokenHash('denied1'), null, null),
      false,
    )
    await db.query('UPDATE users SET is_active = true WHERE id = $1', [user])
    await db.query(
      'UPDATE auth_mfa_credentials SET version = gen_random_uuid() WHERE user_id = $1',
      [user],
    )
    assert.equal(
      await repo.complete(challenge, 100, tokenHash('denied2'), null, null),
      false,
    )
    assert.equal((await db.query('SELECT * FROM user_sessions')).rows.length, 0)
  } finally {
    await db.close()
  }
})

test('database throttles cap concurrent attempts, reset on expiry and propagate storage failures', async () => {
  const { db, repo } = await setup()
  try {
    const results = await Promise.all(
      Array.from({ length: 12 }, () => repo.rateLimit('otp', 'test', 5)),
    )
    assert.equal(results.filter(Boolean).length, 5)
    await db.exec(
      "UPDATE auth_login_limits SET expires_at = now() - interval '1 second'",
    )
    assert.equal(await repo.rateLimit('otp', 'test', 5), true)
    const broken = new MfaRepository(
      {
        query: async () => {
          throw Error('Unavailable')
        },
      },
      'preview',
    )
    await assert.rejects(broken.rateLimit('otp', 'test', 5))
  } finally {
    await db.close()
  }
})
