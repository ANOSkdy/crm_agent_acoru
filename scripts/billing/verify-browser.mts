import { chromium, expect } from '@playwright/test'
import { neon } from '@neondatabase/serverless'
import { config } from 'dotenv'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

config({ path: '.env.local', quiet: true })
if (!process.env.DATABASE_URL) throw Error('Missing database')
const sql = neon(process.env.DATABASE_URL)
const base = process.env.BILLING_TEST_URL ?? 'http://localhost:3100'
if (!base.startsWith('http://localhost:'))
  throw Error('Browser test is restricted to localhost')
const id = randomUUID(),
  token = randomBytes(32).toString('base64url'),
  hash = createHash('sha256').update(token).digest('hex')
const email = `billing-qa-${id}@example.invalid`
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const latest =
    await sql`SELECT period FROM billing.invoices ORDER BY period DESC LIMIT 1`
  if (!latest.length)
    throw Error('Import dummy migration data before browser verification')
  const period = String(latest[0].period)
  const monthly =
    await sql`SELECT id,document,total,status FROM billing.invoices WHERE period=${period} ORDER BY id`
  const target = monthly.find((i) => ['draft', 'simulated'].includes(i.status))
  if (
    !target ||
    monthly.some((i) => !String(i.document.email).endsWith('@example.invalid'))
  )
    throw Error(
      'Browser verification requires dummy recipients and an unsent invoice',
    )
  const customerNames =
    await sql`SELECT data->>'name' as name FROM billing.customers ORDER BY id`
  const targetPath = `/api/billing/pdf/${target.id}`
  await sql`INSERT INTO users(id,name,email,login_id,password_hash,role,is_active) VALUES (${id},'請求管理検証',${email},${'billing-qa-' + id},crypt(${randomBytes(32).toString('hex')},gen_salt('bf')),'admin',true)`
  await sql`INSERT INTO user_sessions(user_id,token_hash,expires_at) VALUES (${id},${hash},now()+interval '20 minutes')`
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  })
  await context.addCookies([
    {
      name: 'acoru_session',
      value: token,
      url: base,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(base + '/billing')
  await expect(
    page.getByRole('heading', { name: '請求管理', exact: true }),
  ).toBeVisible()
  await expect(page.getByText('検証モード・外部送信なし')).toBeVisible()
  const month = page.locator('input[type=month]')
  await month.fill(period)
  const total = monthly.reduce((sum, i) => sum + Number(i.total), 0)
  await expect(
    page
      .getByText(`¥${total.toLocaleString('ja-JP')}`, { exact: true })
      .first(),
  ).toBeVisible()
  await mkdir('.local-test', { recursive: true })
  await page.screenshot({
    path: '.local-test/billing-dashboard.png',
    fullPage: true,
  })
  await page
    .getByRole('button', { name: '月次請求を作成', exact: true })
    .click()
  await expect(page.getByRole('status')).toContainText('0件作成しました')
  await page
    .getByRole('link', { name: target.document.name, exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: '請求内容', exact: true }),
  ).toBeVisible()
  await page.screenshot({
    path: '.local-test/billing-detail.png',
    fullPage: true,
  })
  const response = await context.request.get(base + targetPath)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/pdf')
  await writeFile('.local-test/billing-migrated.pdf', await response.body())
  await page
    .getByRole('button', { name: '送信内容を検証する', exact: true })
    .click()
  await expect(page.getByText('検証済み', { exact: true })).toBeVisible({
    timeout: 45000,
  })
  await page.goto(base + '/billing')
  await page.getByRole('button', { name: '顧客・契約', exact: true }).click()
  await expect(
    page.getByText(customerNames[0].name, { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '編集', exact: true }).first().click()
  await page.getByLabel(/メールアドレス/).fill('unapproved@example.com')
  await page.getByRole('button', { name: '保存する', exact: true }).click()
  await expect(
    page.getByRole('alert').filter({ hasText: 'ダミーアドレスのみ' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '閉じる', exact: true }).click()
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await expect(page.getByLabel('送信元', { exact: true })).toHaveValue(
    'support@acoru.jp',
  )
  await page
    .getByRole('button', { name: '送信・実行履歴', exact: true })
    .click()
  await expect(
    page.getByText('検証のみ・未送信', { exact: true }).first(),
  ).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '請求一覧', exact: true }).click()
  expect(
    await page
      .locator('.app-content')
      .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
  ).toBe(true)
  await page.screenshot({
    path: '.local-test/billing-mobile.png',
    fullPage: true,
  })
  // API access requires a current admin, independently of proxy/layout.
  await sql`UPDATE users SET role='viewer' WHERE id=${id}`
  expect((await context.request.get(base + targetPath)).status()).toBe(403)
  expect(
    (
      await context.request.post(base + '/api/billing', {
        data: { action: 'generate', period },
        headers: { origin: base },
      })
    ).status(),
  ).toBe(403)
  expect((await context.request.get(base + '/api/cron/billing')).status()).toBe(
    401,
  )
  await sql`UPDATE users SET role='admin' WHERE id=${id}`
  expect(
    (
      await context.request.post(base + '/api/billing', {
        data: { action: 'generate', period },
        headers: { origin: 'https://attacker.invalid' },
      })
    ).status(),
  ).toBe(403)
  expect(errors).toEqual([])
  console.log(
    'Browser checks passed: dashboard, duplicate generation, PDF, simulation, dummy-only guard, settings, history, mobile, authorization and CSRF',
  )
} finally {
  await browser.close()
  await sql.transaction([
    sql`DELETE FROM user_sessions WHERE user_id=${id}`,
    sql`DELETE FROM audit_logs WHERE user_id=${id}`,
    sql`DELETE FROM users WHERE id=${id}`,
  ])
}
