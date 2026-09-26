import { chromium, expect } from '@playwright/test'
import { neon } from '@neondatabase/serverless'
import { config } from 'dotenv'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

config({ path: '.env.local', quiet: true })
const base = process.env.BILLING_TEST_URL ?? 'http://localhost:3102'
if (!/^http:\/\/localhost:\d+$/.test(base)) throw Error('Localhost only')
const sql = neon(process.env.DATABASE_URL!)
const id = (await readFile('.local-test/otp-test-id', 'utf8')).trim()
if ((await sql`SELECT id FROM users WHERE id=${id}`).length)
  throw Error('Refusing to alter an existing user')
const company = randomUUID(), contact = randomUUID(), deal = randomUUID()
const customer = `C${company}`
const name = '請求連携検証株式会社'
const token = randomBytes(32).toString('base64url')
const hash = createHash('sha256').update(token).digest('hex')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  await sql`INSERT INTO users(id,name,email,login_id,role,is_active) VALUES (${id},'請求連携検証',${`billing-qa-${id}@example.invalid`},${`billing-qa-${id}`},'admin',true)`
  const [credential] = await sql`INSERT INTO auth_mfa_credentials(user_id,environment,secret_encrypted,confirmed_at) VALUES (${id},'local','fixture-only',now()) RETURNING version`
  await sql`INSERT INTO user_sessions(user_id,token_hash,expires_at,mfa_version,auth_environment) VALUES (${id},${hash},now()+interval '20 minutes',${credential.version},'local')`
  await sql`INSERT INTO companies(id,name,address,postal_code) VALUES (${company},${name},'札幌市中央区テスト一丁目','060-0000')`
  await sql`INSERT INTO contacts(id,company_id,name,email) VALUES (${contact},${company},'検証担当者','crm-contact@example.com')`
  await sql`INSERT INTO deals(id,company_id,title,amount) VALUES (${deal},${company},'月次清掃サービス',50000)`
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } })
  await context.addCookies([{ name: 'acoru_session', value: token, url: base, httpOnly: true, sameSite: 'Strict' }])
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`${base}/companies/${company}`)
  await expect(page.getByRole('heading', { name: '請求設定・請求履歴', exact: true })).toBeVisible()
  await page.getByRole('link', { name: '請求の有効／無効を設定', exact: true }).click()
  const heading = page.getByRole('heading', { name: `${name}の請求設定`, exact: true })
  await expect(heading).toBeVisible()
  await expect(page.getByLabel(/請求の有効／無効/)).toHaveValue('disabled')
  await expect(page.getByLabel('請求担当者', { exact: false })).toHaveValue(contact)
  await expect(page.getByLabel('件名', { exact: true })).toHaveValue('月次清掃サービス')
  await expect(page.getByLabel(/送付先メール/)).toHaveValue(`customer-${company}@example.invalid`)
  await page.getByLabel(/請求の有効／無効/).selectOption('enabled')
  await page.screenshot({ path: '.local-test/crm-billing-settings.png', fullPage: true })
  await page.getByRole('button', { name: '請求設定を保存', exact: true }).click()
  await expect(heading).toHaveCount(0)
  let [invoice] = await sql`SELECT * FROM billing.invoices WHERE customer_id=${customer}`
  expect(invoice.status).toBe('held')
  expect(invoice.company_id).toBe(company)
  expect(invoice.document.provisional).toBe(true)
  expect(invoice.document.email).toBe(`customer-${company}@example.invalid`)
  expect(invoice.document.address).toBe('札幌市中央区テスト一丁目')
  expect(Number(invoice.total)).toBe(55000)
  await page.goto(`${base}/billing/${invoice.id}`)
  await expect(page.getByText(/仮作成した請求書です/)).toBeVisible()
  await expect(page.getByRole('button', { name: '送信内容を検証する', exact: true })).toBeDisabled()
  const pdf = await context.request.get(`${base}/api/billing/pdf/${invoice.id}`)
  expect(pdf.status()).toBe(200)
  await writeFile('.local-test/crm-billing-sample.pdf', await pdf.body())
  await page.getByLabel(/送信状態/).selectOption('draft')
  await page.getByRole('button', { name: '変更を保存', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('保存しました')
  await expect(page.getByRole('button', { name: '送信内容を検証する', exact: true })).toBeEnabled()
  ;[invoice] = await sql`SELECT * FROM billing.invoices WHERE customer_id=${customer}`
  expect(invoice.document.provisional).toBe(false)
  await page.goto(`${base}/billing?company=${company}`)
  await expect(heading).toBeVisible()
  await page.getByRole('button', { name: '請求設定を保存', exact: true }).click()
  await expect(heading).toHaveCount(0)
  expect((await sql`SELECT id FROM billing.invoices WHERE customer_id=${customer}`).length).toBe(1)
  await page.goto(`${base}/billing?company=${company}`)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(heading).toBeVisible()
  expect(await page.locator('.app-content').evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true)
  await page.screenshot({ path: '.local-test/crm-billing-mobile.png', fullPage: true })
  await page.getByLabel(/請求の有効／無効/).selectOption('disabled')
  await page.getByRole('button', { name: '請求設定を保存', exact: true }).click()
  await expect(heading).toHaveCount(0)
  const denied = await context.request.post(`${base}/api/billing`, { headers: { origin: base }, data: { action: 'deliver', id: invoice.id } })
  expect(denied.status()).toBe(400)
  expect((await denied.json()).error).toContain('無効')
  expect((await sql`SELECT id FROM billing.deliveries WHERE invoice_id=${invoice.id}`).length).toBe(0)
  expect(errors).toEqual([])
  console.log('CRM browser checks passed: company link, prefill, dummy recipient preservation, enable/held draft, PDF, explicit confirmation, duplicate prevention, mobile and disabled delivery.')
} finally {
  await browser.close()
  await sql.transaction([
    sql`DELETE FROM billing.deliveries WHERE invoice_id IN (SELECT id FROM billing.invoices WHERE customer_id=${customer})`,
    sql`DELETE FROM billing.events WHERE actor=${id}`,
    sql`DELETE FROM billing.invoices WHERE customer_id=${customer}`,
    sql`DELETE FROM billing.customers WHERE id=${customer}`,
    sql`DELETE FROM deals WHERE id=${deal}`,
    sql`DELETE FROM contacts WHERE id=${contact}`,
    sql`DELETE FROM companies WHERE id=${company}`,
    sql`DELETE FROM user_sessions WHERE user_id=${id}`,
    sql`DELETE FROM audit_logs WHERE user_id=${id}`,
    sql`DELETE FROM users WHERE id=${id}`,
  ])
}
