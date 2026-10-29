import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, expect } from '@playwright/test'
import { testDatabase } from '../../tests/helpers/database'
import { signature } from '../../lib/bulk-mail/domain'

const db = await testDatabase()
const localAuth = process.argv.includes('--local-auth')
const production = process.argv.includes('--production')
if (localAuth && production) throw new Error('Production cannot use local authentication')
console.log('Isolated CRM database ready')
const actor = randomUUID(), company = randomUUID(), second = randomUUID(), prospect = randomUUID(), credential = randomUUID(), duplicate = randomUUID(), missing = randomUUID()
const session = randomBytes(32).toString('base64url'), nonce = randomUUID()
await db.query("INSERT INTO users(id,name,email,role) VALUES($1,'検証管理者','admin@example.invalid','admin')", [actor])
await db.query("INSERT INTO companies(id,name,industry) VALUES($1,'北海テスト株式会社','IT'),($2,'道央サンプル合同会社','建設'),($3,'未契約テスト株式会社','IT')", [company, second, prospect])
await db.query("INSERT INTO deals(company_id,title,status) VALUES($1,'運用支援契約','won'),($2,'業務支援契約','won')", [company, second])
await db.query("INSERT INTO companies(id,name,industry) VALUES($1,'北海共通窓口株式会社','IT'),($2,'代表メール未登録株式会社','IT')", [duplicate, missing])
await db.query("INSERT INTO deals(company_id,title,status) VALUES($1,'運用契約','won'),($2,'運用契約','won')", [duplicate, missing])
const contactIds = Array.from({ length: 6 }, () => randomUUID())
for (const [index, co, name, email] of [[0, company, '山田 太郎', 'yamada@example.invalid'], [1, company, '佐藤 花子', 'sato@example.invalid'], [2, company, '共有窓口', 'YAMADA@example.invalid'], [3, company, 'メール未登録', null], [4, second, '鈴木 一郎', 'suzuki@example.invalid'], [5, prospect, '未契約担当', 'prospect@example.invalid']] as const) {
  await db.query('INSERT INTO contacts(id,company_id,name,email) VALUES($1,$2,$3,$4)', [contactIds[index], co, name, email])
}
if (!localAuth) {
  await db.query("INSERT INTO auth_mfa_credentials(user_id,environment,version,secret_encrypted,confirmed_at) VALUES($1,$3,$2,'isolated-fixture',now())", [actor, credential, production ? 'production' : 'local'])
  await db.query("INSERT INTO user_sessions(user_id,token_hash,expires_at,mfa_version,auth_environment) VALUES($1,$2,now()+interval '1 hour',$3,$4)", [actor, createHash('sha256').update(session).digest('hex'), credential, production ? 'production' : 'local'])
}
const fixtureErrors: string[] = []
const testEmails: { body: Record<string, unknown>; idempotencyKey: string | undefined }[] = []
const testProviderId = randomUUID()
async function sql(q: { query: string; params: unknown[] }, client: { query: typeof db.query } = db) {
  const result = await client.query<Record<string, unknown>>(q.query, q.params)
  return { fields: result.fields, rows: result.rows.map(row => result.fields.map(f => {
    const v = row[f.name]
    if (v == null) return null
    if (v instanceof Date) return v.toISOString().replace('T', ' ').replace('Z', '+00')
    if (typeof v === 'object') return JSON.stringify(v)
    if (typeof v === 'boolean') return v ? 't' : 'f'
    return String(v)
  })), rowCount: result.affectedRows ?? result.rows.length, command: 'SELECT', rowAsArray: true }
}
const fixtureServer = createServer(async (req, res) => {
  if (req.headers['x-fixture'] !== nonce) { res.writeHead(403).end(); return }
  try {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk))
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (req.url === '/email') {
      testEmails.push({ body: data, idempotencyKey: req.headers['idempotency-key'] as string | undefined })
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id: testProviderId })); return
    }
    if (req.url === '/pg') {
      const result = await db.query(data.query, data.params)
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ rows: result.rows })); return
    }
    const response = Array.isArray(data.queries) ? { results: await db.transaction(async tx => { const all = []; for (const q of data.queries) all.push(await sql(q, tx)); return all }) } : await sql(data)
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(response))
  } catch (e) { fixtureErrors.push(e instanceof Error ? e.message : String(e)); res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ message: 'Fixture query failed' })) }
})
fixtureServer.listen(0, '127.0.0.1'); await once(fixtureServer, 'listening')
const fixtureUrl = `http://127.0.0.1:${(fixtureServer.address() as { port: number }).port}`
const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening')
const port = (reservation.address() as { port: number }).port
await new Promise<void>(r => reservation.close(() => r()))
const origin = `http://127.0.0.1:${port}`
const output = production ? '.local-test/bulk-mail/production-browser' : localAuth ? '.local-test/bulk-mail/local-auth-browser' : '.local-test/bulk-mail/browser'
await mkdir(output, { recursive: true })
const logs: string[] = []
const child = spawn(process.execPath, [...(localAuth ? [] : ['--no-wasm-tier-up', '--no-liftoff']), resolve('node_modules/next/dist/bin/next'), ...(localAuth ? ['dev', '--webpack'] : ['start']), '--hostname', '127.0.0.1', '--port', String(port)], { windowsHide: true, env: {
  ...process.env, NODE_OPTIONS: `--import ${pathToFileURL(resolve('tests/helpers/bulk-mail-browser-runtime.mjs')).href}`,
  DATABASE_URL: 'postgresql://fixture:fixture@mail-fixture.neon.tech/fixture', OTP_USER_ID: localAuth ? '' : actor, MFA_ENCRYPTION_KEY: localAuth ? '' : randomBytes(32).toString('base64'),
  LOCAL_AUTH_ENABLED: localAuth ? 'true' : 'false', LOCAL_AUTH_KEY: localAuth ? 'browser-local-key' : '',
  MAIL_BROWSER_FIXTURE: fixtureUrl, MAIL_BROWSER_NONCE: nonce, BULK_MAIL_LOCAL_ENABLED: 'true', BULK_MAIL_STORE_NAME: `browser-${nonce}`, BULK_MAIL_LOCAL_DIR: resolve('.local-test', 'bulk-mail'),
  BILLING_LIVE_SEND_ENABLED: 'false', RESEND_API_KEY: production ? 'browser-fixture-key-not-real' : '', CRON_SECRET: '', VERCEL: '', VERCEL_ENV: production ? 'production' : '', NEXT_TELEMETRY_DISABLED: '1',
  BULK_MAIL_ENABLED: production ? 'true' : 'false', BULK_MAIL_LIVE_SEND_ENABLED: production ? 'true' : 'false', BULK_MAIL_FROM: 'sender@example.invalid', BULK_MAIL_ORIGIN: `https://127.0.0.1:${port}`,
  BULK_MAIL_TEST_ENABLED: localAuth || production ? 'true' : 'false', BULK_MAIL_TEST_TO: 'manual-test@example.invalid', BULK_MAIL_TEST_FROM: 'sender@example.invalid', BULK_MAIL_TEST_API_KEY: localAuth ? 'browser-fixture-key-not-real' : '',
} })
child.stdout.on('data', d => logs.push(String(d))); child.stderr.on('data', d => logs.push(String(d)))
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
let page: import('@playwright/test').Page | undefined
const errors: string[] = []
const passed: string[] = []
try {
  for (let n = 0; n < 80; n++) {
    try { if ((await fetch(origin + '/login')).ok) break } catch {}
    if (child.exitCode !== null) throw new Error('Fixture Next exited during startup')
    if (n === 79) throw new Error('Fixture Next startup failed')
    await new Promise(r => setTimeout(r, 500))
  }
  browser = await chromium.launch({ channel: 'msedge', headless: true })
  console.log('Local server and browser ready')
  const context = await browser.newContext({ viewport: { width: 1440, height: 1060 } })
  if (!localAuth) await context.addCookies([{ name: 'acoru_session', value: session, url: origin, httpOnly: true, sameSite: 'Strict' }])
  page = await context.newPage()
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  if (localAuth) {
    await page.goto(origin + '/bulk-mail')
    await expect(page.getByLabel('ローカル仮認証キー', { exact: true })).toBeVisible()
    await page.getByLabel('ローカル仮認証キー', { exact: true }).fill('wrong-key')
    await page.getByRole('button', { name: '仮認証でログイン', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'ローカル仮認証キーが違います。' })).toBeVisible()
    await page.getByLabel('ローカル仮認証キー', { exact: true }).fill('browser-local-key')
    await page.getByRole('button', { name: '仮認証でログイン', exact: true }).click()
    await page.waitForURL(origin + '/bulk-mail')
    const cookie = (await context.cookies()).find(c => c.name === 'acoru_local_session')!
    expect(cookie.httpOnly).toBe(true); expect(cookie.sameSite).toBe('Strict'); expect(cookie.value).not.toBe('browser-local-key')
    passed.push('local fixed-key login rejects wrong keys, requires no OTP setup, preserves next URL and issues an opaque local session')
  }
  const anonymous = await browser.newContext()
  expect((await anonymous.request.get(origin + '/api/bulk-mail')).status()).toBe(401)
  await anonymous.close()
  const csrf = await context.request.post(origin + '/api/bulk-mail', { data: { action: 'test', id: randomUUID(), version: 1 }, headers: { Origin: 'https://invalid.example' } })
  expect(csrf.status()).toBe(403); passed.push('anonymous and cross-origin requests rejected')
  await page.goto(origin + '/bulk-mail')
  await expect(page.getByRole('heading', { name: '一斉メール', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '一斉メール', exact: true })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: '未契約テスト株式会社を選択' })).toHaveCount(0)
  await expect(page.getByRole('checkbox', { name: '北海テスト株式会社を選択' })).toBeDisabled()
  await expect(page.getByRole('checkbox', { name: /山田|佐藤|鈴木/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '宛先・本文を最終確認', exact: true })).toBeDisabled()
  const billingBefore = (await db.query('SELECT id,data FROM billing.customers ORDER BY id')).rows
  if (localAuth || production) {
    await page.getByRole('button', { name: '実メールのテスト', exact: true }).click()
    await expect(page.getByRole('heading', { name: '実メールの手動テスト', exact: true })).toBeVisible()
    expect(testEmails.length).toBe(0)
    await page.getByRole('button', { name: 'テストメールを準備', exact: true }).click()
    await expect(page.getByRole('heading', { name: '送信前の確認（未送信）', exact: true })).toBeVisible()
    await expect(page.getByLabel('手動テストの送信確認')).toContainText('manual-test@example.invalid')
    await expect(page.getByLabel('手動テストの送信確認')).toContainText(signature)
    await expect(page.getByRole('button', { name: '確認した宛先に1通送信', exact: true })).toBeDisabled()
    expect(testEmails.length).toBe(0)
    const injected = await context.request.post(origin + '/api/bulk-mail/test', { headers: { Origin: origin }, data: { action: 'prepare', data: { subject: 'injected', body: 'body', to: 'other@example.invalid' } } })
    expect(injected.status()).toBe(400)
    const unconfirmed = await context.request.post(origin + '/api/bulk-mail/test', { headers: { Origin: origin }, data: { action: 'send', id: randomUUID(), confirmed: false } })
    expect(unconfirmed.status()).toBe(400)
    await page.screenshot({ path: output + '/manual-test-prepared.png', fullPage: true })
    // The preload routes this request to the isolated fake provider, never Resend.
    await page.getByRole('checkbox', { name: 'この宛先・件名・本文でテストメールを1通送信します。', exact: true }).check()
    await page.getByRole('button', { name: '確認した宛先に1通送信', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'メールサービス受付済み', exact: true })).toBeVisible()
    expect(testEmails.length).toBe(1)
    expect(testEmails[0].body.to).toEqual(['manual-test@example.invalid'])
    expect(testEmails[0].body.subject).toBe('【テスト】業務連絡メールの送信確認')
    expect(testEmails[0].idempotencyKey).toMatch(/^local-manual-test-/)
    await page.reload()
    await page.getByRole('button', { name: '実メールのテスト', exact: true }).click()
    await page.getByRole('button', { name: 'テストメールを準備', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'メールサービス受付済み', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '確認した宛先に1通送信', exact: true })).toHaveCount(0)
    expect(testEmails.length).toBe(1)
    passed.push('manual test preparation sends nothing; explicit confirmation uses a fake provider once and survives reload without resending')
  }
  await page.getByRole('button', { name: '代表メール設定', exact: true }).click()
  for (const [name, email] of [['北海テスト株式会社', 'office@example.invalid'], ['道央サンプル合同会社', 'info@example.invalid'], ['北海共通窓口株式会社', 'OFFICE@example.invalid']]) {
    await page.getByLabel(`${name}の代表メール`, { exact: true }).fill(email)
    await page.getByRole('button', { name: `${name}の代表メールを保存`, exact: true }).click()
    await expect(page.getByRole('status')).toContainText('代表メールを保存しました')
  }
  expect((await db.query('SELECT id,data FROM billing.customers ORDER BY id')).rows).toEqual(billingBefore)
  await page.screenshot({ path: output + '/addresses-desktop.png', fullPage: true })
  await page.reload()
  await page.getByRole('button', { name: '代表メール設定', exact: true }).click()
  await expect(page.getByLabel('北海テスト株式会社の代表メール', { exact: true })).toHaveValue('office@example.invalid')
  await page.getByRole('button', { name: '作成・確認', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: '代表メール未登録株式会社を選択' })).toBeDisabled()
  await page.getByLabel('業種', { exact: true }).selectOption('IT')
  await page.getByLabel('表示中を全選択', { exact: true }).check()
  await expect(page.getByText('選択 2社 ／ 送信予定 1件', { exact: true })).toBeVisible()
  await page.getByLabel('業種', { exact: true }).selectOption('建設')
  await page.getByLabel('表示中を全選択', { exact: true }).check()
  await expect(page.getByText('選択 3社 ／ 送信予定 2件', { exact: true })).toBeVisible()
  await page.getByLabel('業種', { exact: true }).selectOption('')
  await page.getByRole('checkbox', { name: '道央サンプル合同会社を選択' }).uncheck()
  await expect(page.getByText('選択 2社 ／ 送信予定 1件', { exact: true })).toBeVisible()
  await page.getByRole('checkbox', { name: '道央サンプル合同会社を選択' }).check()
  await page.getByLabel('件名', { exact: true }).fill('【業務連絡】サービスメンテナンスのお知らせ')
  await page.getByLabel('本文', { exact: true }).fill('{{会社名}}\nご担当者様\n\nいつもお世話になっております。\n11月1日にメンテナンスを実施します。')
  await page.screenshot({ path: output + '/compose-desktop.png', fullPage: true })
  await page.getByRole('button', { name: '下書きを保存', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('下書きを保存しました')
  await page.reload()
  await page.getByRole('button', { name: /下書き・送信履歴/ }).click()
  await page.getByRole('button', { name: /【業務連絡】サービスメンテナンスのお知らせ/ }).click()
  await expect(page.getByLabel('件名', { exact: true })).toHaveValue('【業務連絡】サービスメンテナンスのお知らせ')
  passed.push('representative address registration/persistence independent of billing and contacts; company filtering, select all, deselection, deduplication and draft persistence')
  await page.getByRole('button', { name: production ? '本文・署名を確認' : '自分宛てにテスト（模擬）', exact: true }).click()
  await expect(page.getByText(/テスト結果：admin@example.invalid/)).toBeVisible()
  await page.getByRole('button', { name: '宛先・本文を最終確認', exact: true }).click()
  await expect(page.getByRole('heading', { name: '最終宛先一覧' })).toBeVisible()
  await expect(page.getByText('送信予定 2件 ／ 対象外 1件', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: production ? '2件に今すぐ送信' : '2件に今すぐ模擬送信' })).toBeDisabled()
  await page.getByRole('button', { name: '本文を見る', exact: true }).first().click()
  await expect(page.getByRole('dialog')).toContainText(signature)
  await expect(page.getByRole('dialog')).toContainText(/様/)
  await page.getByRole('button', { name: '閉じる', exact: true }).click()
  const list = await context.request.get(origin + '/api/bulk-mail')
  const id = (await list.json()).campaigns[0].id as string
  await page.getByRole('button', { name: '代表メール設定', exact: true }).click()
  await page.getByLabel('道央サンプル合同会社の代表メール', { exact: true }).fill('service@example.invalid')
  await page.getByRole('button', { name: '道央サンプル合同会社の代表メールを保存', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('代表メールを保存しました')
  await page.getByRole('button', { name: '作成・確認', exact: true }).click()
  await expect(page.getByRole('heading', { name: '最終宛先一覧' })).toHaveCount(0)
  const changed = await context.request.post(origin + '/api/bulk-mail', { data: { action: 'start', id, version: 1, confirmed: true }, headers: { Origin: origin } })
  expect(changed.status()).toBe(409)
  await page.getByRole('button', { name: '宛先・本文を最終確認', exact: true }).click()
  await expect(page.getByText('送信予定 2件 ／ 対象外 1件', { exact: true })).toBeVisible()
  await page.getByLabel('宛先・件名・本文・署名を確認しました。', { exact: true }).check()
  await page.screenshot({ path: output + '/review-desktop.png', fullPage: true })
  if (production) expect(testEmails).toHaveLength(1)
  await page.getByRole('button', { name: production ? '2件に今すぐ送信' : '2件に今すぐ模擬送信', exact: true }).click()
  await expect(page.getByRole('status')).toContainText(production ? '実送信を開始しました' : '模擬送信を開始しました')
  await page.close(); page = undefined
  // No browser is open while the server consumes the persisted job.
  await expect.poll(async () => (await (await context.request.get(`${origin}/api/bulk-mail?id=${id}`)).json()).campaign.status).toBe('completed')
  const delivered = (await (await context.request.get(`${origin}/api/bulk-mail?id=${id}`)).json()).campaign
  expect(delivered.deliveries.filter((d: { status: string }) => d.status === (production ? 'sent' : 'simulated'))).toHaveLength(2)
  expect(delivered.deliveries.filter((d: { status: string }) => d.status === 'excluded')).toHaveLength(1)
  expect(delivered.deliveries.every((d: { contactId?: string }) => !d.contactId)).toBe(true)
  expect(delivered.deliveries.filter((d: { status: string }) => d.status === (production ? 'sent' : 'simulated')).map((d: { email: string }) => d.email.toLowerCase()).sort()).toEqual(['office@example.invalid', 'service@example.invalid'])
  const repeat = await context.request.post(origin + '/api/bulk-mail', { data: { action: 'start', id, version: 1, confirmed: true }, headers: { Origin: origin } })
  expect(repeat.status()).toBe(409)
  if (production) {
    expect(testEmails).toHaveLength(3)
    expect(testEmails.slice(1).flatMap(e => e.body.to).sort()).toEqual(['office@example.invalid', 'service@example.invalid'])
    expect(testEmails.every(e => e.idempotencyKey)).toBe(true)
    passed.push('production uses persistent storage and manual live confirmation; preview/review/GET send nothing and a fake provider receives one email per representative')
  }
  passed.push('fixed signature and company-only recipients; address changes require reconfirmation; server processing after closing browser and duplicate start rejection')
  page = await context.newPage()
  await page.goto(origin + '/bulk-mail')
  await page.getByRole('button', { name: /下書き・送信履歴/ }).click()
  await page.getByRole('button', { name: /【業務連絡】サービスメンテナンスのお知らせ/ }).click()
  await expect(page.getByText('処理完了', { exact: true })).toBeVisible()
  await page.screenshot({ path: output + '/history-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 760, height: 1000 })
  await page.screenshot({ path: output + '/history-tablet.png', fullPage: true })
  await page.goto(`${origin}/companies/${company}`)
  await expect(page.getByRole('heading', { name: '業務連絡メール', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'メールを作成・履歴を確認', exact: true })).toBeVisible()
  await page.getByRole('link', { name: '代表メールを設定', exact: true }).click()
  await expect(page.getByRole('heading', { name: '顧客ごとの代表メール設定' })).toBeVisible()
  await expect(page.getByLabel('北海テスト株式会社の代表メール', { exact: true })).toHaveValue('office@example.invalid')
  passed.push('history reload, tablet layout, company-detail history and representative address management linkage')
  // API authorization is checked after authentication, even if navigation is bypassed.
  await db.query("UPDATE users SET role='viewer' WHERE id=$1", [actor])
  expect((await context.request.get(origin + '/api/bulk-mail')).status()).toBe(localAuth ? 401 : 403)
  await db.query("UPDATE users SET role='admin' WHERE id=$1", [actor])
  if (localAuth) {
    await page.goto(origin + '/bulk-mail')
    await page.getByRole('button', { name: 'ログアウト', exact: true }).click()
    await expect(page.getByLabel('ローカル仮認証キー', { exact: true })).toBeVisible()
    expect((await context.request.get(origin + '/api/bulk-mail')).status()).toBe(401)
    const untouched = (await db.query<{ credentials: number; sessions: number; events: number }>("SELECT (SELECT count(*)::int FROM auth_mfa_credentials) credentials,(SELECT count(*)::int FROM user_sessions) sessions,(SELECT count(*)::int FROM audit_logs WHERE target_type='auth') events")).rows[0]
    expect(untouched).toEqual({ credentials: 0, sessions: 0, events: 0 })
    passed.push('local logout revokes the session and authentication tables remain unchanged')
  }
  expect(fixtureErrors).toEqual([])
  expect(errors).toEqual([])
  await writeFile(output + '/verified.json', JSON.stringify({ passed, browserErrors: errors, fixtureErrors, realEmailsSent: 0 }, null, 2))
  console.log(JSON.stringify({ passed, realEmailsSent: 0, screenshots: output }))
} catch (error) {
  if (page) await page.screenshot({ path: output + '/failure.png', fullPage: true }).catch(() => {})
  await writeFile(output + '/failure.log', logs.join(''))
  console.error({ fixtureErrors, browserErrors: errors, recentLogs: logs.join('').slice(-5000) })
  throw error
} finally {
  await browser?.close()
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit')
    child.kill()
    await exited.catch(() => {})
  }
  await new Promise<void>(r => fixtureServer.close(() => r()))
  await db.close()
}
