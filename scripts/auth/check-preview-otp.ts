// Operator-only preflight. Run in a Preview build so sensitive Vercel values
// remain inside Vercel; never export the encryption key or OTP secret.
import { neon } from '@neondatabase/serverless'
import { createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { authenticator, decryptSecret, otpUserId } from '../../lib/auth/mfa-crypto'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const decode = (value: string) => value
  .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

async function check() {
  if (process.env.VERCEL_ENV !== 'preview') throw Error('Preview required')
  const url = process.env.DATABASE_URL
  const expectedHost = process.env.AUTH_EXPECTED_DATABASE_HOST_HASH
  const expectedCredential = process.env.AUTH_EXPECTED_CREDENTIAL_HASH
  if (!url || !expectedHost || !expectedCredential) throw Error('Missing assertions')
  if (hash(new URL(url).hostname.replace('-pooler', '')) !== expectedHost)
    throw Error('Database isolation failed')
  const db = neon(url), userId = otpUserId()
  const [rows] = await db.transaction([
    db.query(`SELECT m.secret_encrypted,m.last_used_step FROM auth_mfa_credentials m
      JOIN users u ON u.id=m.user_id WHERE m.user_id=$1 AND m.environment='preview'
      AND m.confirmed_at IS NOT NULL AND u.is_active=true AND u.role='admin'`, [userId]),
  ], { readOnly: true })
  if (rows.length !== 1 || hash(rows[0].secret_encrypted) !== expectedCredential)
    throw Error('Existing registration mismatch')
  const secret = decryptSecret(rows[0].secret_encrypted, `preview:${userId}`)
  console.log('PASS: isolated Preview DB, existing UID and encrypted OTP registration, inherited Vercel key.')

  // Optional release verification uses the real login Server Action, then
  // revokes only its own session. No test route or authentication bypass.
  const origin = process.env.AUTH_VERIFY_ORIGIN
  if (!origin) return
  if (!/^https:\/\/crm-agent-acoru-[a-z0-9]+-acrou-pro\.vercel\.app$/.test(origin))
    throw Error('Unexpected verification origin')
  const oidc = process.env.AUTH_VERIFY_OIDC_TOKEN
  if (!oidc) throw Error('Missing deployment protection credential')
  const headers = { 'x-vercel-trusted-oidc-idp-token': oidc }
  const request = (path: string, init: RequestInit = {}) => fetch(origin + path, {
    ...init, headers: { ...headers, ...init.headers }, redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  })
  const anonymous = await request('/dashboard')
  if (![303, 307].includes(anonymous.status) || !anonymous.headers.get('location')?.includes('/login'))
    throw Error('Anonymous access was not denied')
  const page = await request('/login?next=%2Fdashboard')
  if (page.status !== 200) throw Error('Login page unavailable')
  const html = await page.text(), form = new FormData()
  for (const input of html.match(/<input\b[^>]*>/g) ?? []) {
    const name = input.match(/\bname="([^"]*)"/)?.[1]
    if (name?.startsWith('$ACTION'))
      form.set(decode(name), decode(input.match(/\bvalue="([^"]*)"/)?.[1] ?? ''))
  }
  if (![...form.keys()].some(name => name.startsWith('$ACTION_REF_')))
    throw Error('Login action not found')
  const remaining = 30_000 - Date.now() % 30_000
  if (remaining < 8_000) await delay(remaining + 200)
  if (Number(rows[0].last_used_step) >= Math.floor(Date.now() / 30_000))
    throw Error('Current OTP already used; retry on next step')
  form.set('next', '/dashboard')
  form.set('code', authenticator(secret, '').generate())
  let sessionHash: string | undefined
  try {
    const response = await request('/login?next=%2Fdashboard', {
      method: 'POST', body: form,
      headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'User-Agent': 'CRM-preview-auth-verification' },
    })
    const cookie = response.headers.getSetCookie().find(value => value.startsWith('acoru_session='))
    const token = cookie?.match(/^acoru_session=([^;]+)/)?.[1]
    if (token) sessionHash = hash(token)
    if (response.status !== 303 || response.headers.get('location') !== '/dashboard' || !token)
      throw Error('Existing OTP login failed')
    if (!cookie || !/httponly/i.test(cookie) || !/secure/i.test(cookie) || !/samesite=strict/i.test(cookie))
      throw Error('Session cookie protection failed')
    const signedInHeaders = { Cookie: `acoru_session=${token}` }
    const raw = await request('/dashboard', { headers: signedInHeaders })
    if (raw.status !== 200 || !(await raw.text()).includes('Acoru')) throw Error('RAW page failed')
    const documents = await request('/api/raw/documents?page=0', { headers: signedInHeaders })
    if (documents.status !== 200 || !Array.isArray((await documents.json()).documents))
      throw Error('Authenticated RAW API failed')
    console.log('PASS: anonymous redirect; existing OTP login 303; secure session; Assistant page/RAW API 200.')
  } finally {
    if (sessionHash) {
      await db.query(`UPDATE user_sessions SET revoked_at=now()
        WHERE user_id=$1 AND token_hash=$2 AND auth_environment='preview' AND revoked_at IS NULL`, [userId, sessionHash])
      console.log('PASS: verification session revoked; no business-data writes.')
    }
  }
}

check().catch(() => {
  console.error('Preview OTP check failed. Review environment/registration; no secrets printed.')
  process.exitCode = 1
})
