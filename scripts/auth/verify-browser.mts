import { chromium, expect as baseExpect } from '@playwright/test'
import { neon } from '@neondatabase/serverless'
import { config } from 'dotenv'
import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { readFile, mkdir } from 'node:fs/promises'
import { Secret, TOTP } from 'otpauth'
config({ path: '.env.local', quiet: true })
const base = process.env.AUTH_TEST_URL ?? 'http://localhost:3102'
if (!/^http:\/\/localhost:\d+$/.test(base))
  throw Error('OTP fixture test is localhost-only')
const id = (await readFile('.local-test/otp-test-id', 'utf8')).trim()
const sql = neon(process.env.DATABASE_URL!)
if ((await sql`SELECT id FROM users WHERE id=${id}`).length)
  throw Error('Refusing to alter an existing user')
const key = Buffer.from(process.env.MFA_ENCRYPTION_KEY!, 'base64'),
  secret = Secret.fromHex(randomBytes(20).toString('hex')).base32
// Provision an OTP outside the public login UI, as in the operator setup flow.
const iv = randomBytes(12),
  c = createCipheriv('aes-256-gcm', key, iv)
c.setAAD(Buffer.from(`local:${id}`))
const ciphertext = Buffer.concat([c.update(secret, 'utf8'), c.final()])
const encrypted = [iv, c.getAuthTag(), ciphertext]
  .map((v) => v.toString('base64url'))
  .join('.')
const hash = (v: string) => createHash('sha256').update(v).digest('hex')
const totp = new TOTP({ secret, algorithm: 'SHA1', digits: 6, period: 30 })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({
  viewport: { width: 1280, height: 950 },
})
const page = await context.newPage(),
  expect = baseExpect.configure({ timeout: 15000 })
const oldToken = randomBytes(32).toString('base64url')
async function submit(value: string) {
  await page.getByLabel('認証コード（6桁）', { exact: true }).fill(value)
  await page
    .getByRole('button', { name: '認証してログイン', exact: true })
    .click()
}
try {
  await sql`INSERT INTO users(id,name,email,login_id,role,is_active) VALUES (${id},'OTP検証',${`otp-qa-${id}@example.invalid`},${`otp-qa-${id}`},'admin',true)`
  await sql`INSERT INTO auth_mfa_credentials(user_id,environment,secret_encrypted) VALUES (${id},'local',${encrypted})`
  await sql`INSERT INTO user_sessions(user_id,token_hash,expires_at) VALUES (${id},${hash(oldToken)},now()+interval '20 minutes')`
  await context.addCookies([
    {
      name: 'acoru_session',
      value: oldToken,
      url: base,
      httpOnly: true,
      sameSite: 'Strict',
    },
  ])
  await page.goto(base + '/billing')
  await expect(page).toHaveURL(/\/login/)
  await context.clearCookies()
  await page.goto(base + '/login?next=%2Fbilling')
  await expect(page.getByLabel('ログインID', { exact: true })).toHaveCount(0)
  await expect(page.locator('input[type=password]')).toHaveCount(0)
  await expect(page.locator('img')).toHaveCount(0)
  await submit(totp.generate({ timestamp: Date.now() - 120000 }))
  await expect(page.locator('.login-form__error')).toContainText(
    '認証できませんでした',
  )
  const code = totp.generate()
  await submit(code)
  await page.waitForURL('**/billing')
  const session = (await context.cookies()).find(
    (v) => v.name === 'acoru_session',
  )!
  expect(session.httpOnly).toBe(true)
  expect(session.sameSite).toBe('Strict')
  expect(session.expires - Date.now() / 1000).toBeLessThanOrEqual(28800)
  await context.clearCookies()
  await page.goto(base + '/login?next=%2Fbilling')
  await submit(code)
  await expect(page.locator('.login-form__error')).toContainText(
    /使用済み|認証できませんでした/,
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await mkdir('.local-test', { recursive: true })
  await page.screenshot({
    path: '.local-test/otp-only-mobile.png',
    fullPage: true,
  })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await submit(totp.generate({ timestamp: Date.now() + 30000 }))
  await page.waitForURL('**/billing')
  await sql`UPDATE user_sessions SET created_at=now()-interval '9 hours' WHERE user_id=${id}`
  expect(
    (
      await context.request.get(base + '/api/billing/pdf/INV-202609-1')
    ).status(),
  ).toBe(403)
  await sql`UPDATE user_sessions SET created_at=now() WHERE user_id=${id}`
  await sql`UPDATE auth_mfa_credentials SET version=gen_random_uuid() WHERE user_id=${id} AND environment='local'`
  expect(
    (
      await context.request.get(base + '/api/billing/pdf/INV-202609-1')
    ).status(),
  ).toBe(403)
  console.log(
    'OTP-only browser checks passed: no ID/password or public enrollment, wrong/expired/reused code denial, valid OTP login, legacy session denial, fixed 8-hour expiry, reset invalidation and mobile layout.',
  )
} finally {
  await browser.close()
  await sql.transaction([
    sql`DELETE FROM user_sessions WHERE user_id=${id}`,
    sql`DELETE FROM audit_logs WHERE user_id=${id}`,
    sql`DELETE FROM auth_login_limits WHERE key=${`local:otp-only-user:${hash(id)}`}`,
    sql`DELETE FROM users WHERE id=${id}`,
  ])
}
