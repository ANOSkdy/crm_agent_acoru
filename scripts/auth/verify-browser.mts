import { chromium, expect as baseExpect } from '@playwright/test'
import { neon } from '@neondatabase/serverless'
import { config } from 'dotenv'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createDecipheriv } from 'node:crypto'
import { TOTP } from 'otpauth'
import { readFile, mkdir } from 'node:fs/promises'

config({ path: '.env.local', quiet: true })
const expect = baseExpect.configure({ timeout: 15000 })
const previewConfig =
  process.argv[2] === '--preview'
    ? (JSON.parse(await readFile(process.argv[3], 'utf8')) as {
        url: string
        accessUrl: string
        keyPath: string
      })
    : null
const environment = previewConfig ? 'preview' : 'local'
const base =
  previewConfig?.url ?? process.env.AUTH_TEST_URL ?? 'http://localhost:3100'
if (
  previewConfig
    ? !/^https:\/\/crm-agent-acoru-[a-z0-9]+-acrou-pro\.vercel\.app$/.test(base)
    : !/^http:\/\/localhost:\d+$/.test(base)
)
  throw Error('Use localhost or an explicitly selected CRM preview deployment')
if (previewConfig && new URL(previewConfig.accessUrl).origin !== base)
  throw Error('Preview access URL must match the deployment')
const key = previewConfig
  ? (await readFile(previewConfig.keyPath, 'utf8')).trim()
  : process.env.MFA_ENCRYPTION_KEY
if (!process.env.DATABASE_URL || !key)
  throw Error('Missing local configuration')
const sql = neon(process.env.DATABASE_URL)
const id = randomUUID(),
  loginId = `mfa-qa-${id}`,
  password = randomBytes(24).toString('base64url')
const oldToken = randomBytes(32).toString('base64url')
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({
  viewport: { width: 1280, height: 1000 },
})
const page = await context.newPage()
const errors: string[] = []
page.on('pageerror', (e) => errors.push(e.message))
async function login() {
  await page.goto(base + '/login?next=%2Fbilling')
  await page.getByLabel('ログインID', { exact: true }).fill(loginId)
  await page.getByLabel('パスワード', { exact: true }).fill(password)
  await page
    .getByRole('button', { name: '認証コードへ進む', exact: true })
    .click()
  await page.waitForURL('**/login/verify')
}
async function code(offset = 0) {
  const [row] =
    await sql`SELECT secret_encrypted FROM auth_mfa_credentials WHERE user_id=${id} AND environment=${environment}`
  const [iv, tag, encrypted] = row.secret_encrypted
    .split('.')
    .map((v: string) => Buffer.from(v, 'base64url'))
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(key!, 'base64'),
    iv,
  )
  decipher.setAAD(Buffer.from(`${environment}:${id}`))
  decipher.setAuthTag(tag)
  const secret = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString('utf8')
  return new TOTP({
    secret,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  }).generate({ timestamp: Date.now() + offset })
}
async function submit(value: string) {
  await page.getByLabel('認証コード（6桁）', { exact: true }).fill(value)
  await page
    .getByRole('button', { name: '認証してログイン', exact: true })
    .click()
}
try {
  if (previewConfig) await page.goto(previewConfig.accessUrl)
  await sql`INSERT INTO users(id,name,email,login_id,password_hash,role,is_active) VALUES (${id},'OTP検証',${`${loginId}@example.invalid`},${loginId},crypt(${password},gen_salt('bf')),'admin',true)`
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
  await context.clearCookies({ name: 'acoru_session' })
  await login()
  await expect(
    page.getByRole('heading', { name: '1Passwordに登録', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByAltText('1Passwordへの初回登録用QRコード'),
  ).toBeVisible()
  expect(
    (await context.cookies()).some((c) => c.name === 'acoru_session'),
  ).toBe(false)
  expect(
    (
      await context.request.get(base + '/api/billing/pdf/INV-202609-1')
    ).status(),
  ).toBe(403)
  // The image/key belong only to this disposable test account and are not saved to screenshots.
  await submit(await code(-120_000))
  await expect(page.locator('.login-form__error')).toContainText(
    '認証できませんでした',
  )
  const enrollmentCode = await code()
  await submit(enrollmentCode)
  await page.waitForURL('**/billing')
  const sessionCookie = (await context.cookies()).find(
    (c) => c.name === 'acoru_session',
  )!
  expect(sessionCookie.httpOnly).toBe(true)
  expect(sessionCookie.sameSite).toBe('Strict')
  expect(sessionCookie.expires - Date.now() / 1000).toBeLessThanOrEqual(
    8 * 3600,
  )
  await context.clearCookies({ name: 'acoru_session' })
  await login()
  await expect(
    page.getByRole('heading', { name: '認証コードを確認', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByAltText('1Passwordへの初回登録用QRコード'),
  ).toHaveCount(0)
  await mkdir('.local-test', { recursive: true })
  await page.screenshot({
    path: `.local-test/mfa-${environment}-verify.png`,
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: `.local-test/mfa-${environment}-mobile.png`,
    fullPage: true,
  })
  await submit(enrollmentCode)
  await expect(page.locator('.login-form__error')).toContainText(
    /使用済み|認証できませんでした/,
  )
  await submit(await code(30_000))
  await page.waitForURL('**/billing')
  // Replacing the credential invalidates sessions immediately without a password-only fallback.
  await sql`UPDATE auth_mfa_credentials SET version=gen_random_uuid() WHERE user_id=${id} AND environment=${environment}`
  expect(
    (
      await context.request.get(base + '/api/billing/pdf/INV-202609-1')
    ).status(),
  ).toBe(403)
  await page.goto(base + '/billing')
  await expect(page).toHaveURL(/\/login/)
  expect(errors).toEqual([])
  console.log(
    'MFA browser checks passed: legacy session denial, password-only denial, first enrollment, incorrect OTP, confirmed-key concealment, replay denial, subsequent OTP login, strict 8-hour cookie, reset invalidation.',
  )
} finally {
  await browser.close()
  await sql.transaction([
    sql`DELETE FROM user_sessions WHERE user_id=${id}`,
    sql`DELETE FROM audit_logs WHERE user_id=${id}`,
    sql`DELETE FROM auth_login_limits WHERE key LIKE ${`${environment}:%:${hash(id)}`} OR key LIKE ${`${environment}:%:${hash(loginId)}`}`,
    sql`DELETE FROM users WHERE id=${id}`,
  ])
}
