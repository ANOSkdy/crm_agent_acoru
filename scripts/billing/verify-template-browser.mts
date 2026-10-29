import { chromium, expect } from '@playwright/test'
import { neon } from '@neondatabase/serverless'
import { config } from 'dotenv'
import { createHash, randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

config({ path: '.env.local', quiet: true })
const base = process.env.BILLING_TEST_URL ?? 'http://localhost:3104'
if (!/^http:\/\/localhost:\d+$/.test(base)) throw Error('Localhost only')
const sql = neon(process.env.DATABASE_URL!)
const id = (await readFile('.local-test/otp-test-id', 'utf8')).trim()
if ((await sql`SELECT id FROM users WHERE id=${id}`).length)
  throw Error('Refusing to alter an existing user')
const token = randomBytes(32).toString('base64url')
const hash = createHash('sha256').update(token).digest('hex')
const counts = () => sql`SELECT
 (SELECT count(*)::int FROM billing.invoices) AS invoices,
 (SELECT count(*)::int FROM billing.deliveries) AS deliveries,
 (SELECT count(*)::int FROM billing.events) AS events`
const before = await counts()
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  await sql`INSERT INTO users(id,name,email,login_id,role,is_active) VALUES (${id},'帳票検証',${`billing-qa-${id}@example.invalid`},${`billing-qa-${id}`},'admin',true)`
  const [credential] =
    await sql`INSERT INTO auth_mfa_credentials(user_id,environment,secret_encrypted,confirmed_at) VALUES (${id},'local','fixture-only',now()) RETURNING version`
  await sql`INSERT INTO user_sessions(user_id,token_hash,expires_at,mfa_version,auth_environment) VALUES (${id},${hash},now()+interval '20 minutes',${credential.version},'local')`
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  })
  await context.addCookies([
    {
      name: 'acoru_session',
      value: token,
      url: base,
      httpOnly: true,
      sameSite: 'Strict',
    },
  ])
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}/billing/templates`)
  await expect(
    page.getByRole('heading', {
      name: '請求書・見積書テンプレート',
      exact: true,
    }),
  ).toBeVisible()
  await page.getByLabel(/CRM顧客から入力/).selectOption({ index: 1 })
  await expect(page.getByLabel('宛名', { exact: true })).not.toHaveValue('')
  await page.getByLabel('宛名', { exact: true }).fill('検証株式会社')
  await page.getByLabel('件名', { exact: true }).fill('テンプレート検証')
  await page.getByLabel('発行日', { exact: true }).fill('2026-09-30')
  await page.getByLabel('見積有効期限', { exact: true }).fill('2026-10-30')
  await page.getByLabel('品名 1', { exact: true }).fill('検証用サービス')
  await page.getByLabel('数量 1', { exact: true }).fill('1')
  await page.getByLabel('単価 1', { exact: true }).fill('50000')
  await page.getByRole('button', { name: 'PDFを作成', exact: true }).click()
  await expect(
    page.getByRole('link', { name: 'PDFをダウンロード' }),
  ).toBeVisible({ timeout: 30000 })
  await expect(page.locator('iframe[title="帳票プレビュー"]')).toBeVisible()
  await page.getByLabel('件名', { exact: true }).fill('変更後')
  await expect(
    page.getByRole('link', { name: 'PDFをダウンロード' }),
  ).toHaveCount(0)
  await page.getByLabel(/帳票の種類/).selectOption('invoice')
  await expect(page.getByLabel('見積条件', { exact: true })).toHaveCount(0)
  await page.getByLabel('支払期日', { exact: true }).fill('2026-10-31')
  await page.getByRole('button', { name: 'PDFを作成', exact: true }).click()
  await expect(
    page.getByRole('link', { name: 'PDFをダウンロード' }),
  ).toBeVisible({ timeout: 30000 })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page
      .locator('.app-content')
      .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
  ).toBe(true)
  await page.screenshot({
    path: '.local-test/template-mobile.png',
    fullPage: true,
  })
  const data = {
    kind: 'quotation',
    name: '検証株式会社',
    honorific: '御中',
    subject: '動作確認',
    issueDate: '2026-09-30',
    validUntil: '2026-10-30',
    delivery: '約2週間',
    conditions: '見本',
    sample: true,
    lines: [{ name: '検証用', quantity: 1, unit: '式', unitPrice: 50000 }],
  }
  const request = (payload = data, origin = base) =>
    context.request.post(`${base}/api/billing/templates`, {
      headers: { origin },
      data: payload,
    })
  const pdf = await request()
  expect(pdf.status()).toBe(200)
  expect(pdf.headers()['content-type']).toBe('application/pdf')
  expect(pdf.headers()['x-acoru-template-version']).toBe('1.0.0')
  await writeFile('.local-test/template-api-quotation.pdf', await pdf.body())
  expect((await request({ ...data, validUntil: '2026-01-01' })).status()).toBe(
    400,
  )
  expect(
    (await request(data, 'https://attacker.example.invalid')).status(),
  ).toBe(403)
  await sql`UPDATE users SET role='viewer' WHERE id=${id}`
  expect((await request()).status()).toBe(403)
  await context.clearCookies()
  expect((await request()).status()).toBe(403)
  expect(await counts()).toEqual(before)
  expect(errors).toEqual([])
  console.log(
    'Template checks passed: CRM prefill, both PDFs, stale preview prevention, mobile, date validation, CSRF, access control, no billing writes or email deliveries.',
  )
} finally {
  await browser.close()
  await sql.transaction([
    sql`DELETE FROM user_sessions WHERE user_id=${id}`,
    sql`DELETE FROM audit_logs WHERE user_id=${id}`,
    sql`DELETE FROM users WHERE id=${id}`,
  ])
}
