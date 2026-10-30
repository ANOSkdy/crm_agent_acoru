import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, expect } from '@playwright/test'
import { testDatabase } from '../../tests/helpers/database'
const db = await testDatabase(), actor = randomUUID(), company = randomUUID(), other = randomUUID(), credential = randomUUID()
const session = randomBytes(32).toString('base64url'), nonce = randomUUID()
await db.query("INSERT INTO users(id,name,email,role) VALUES($1,'課題検証','issues@example.invalid','admin')", [actor])
await db.query("INSERT INTO companies(id,name,status) VALUES($1,'既存顧客','active'),($2,'未契約の顧客','inactive')", [company, other])
await db.query("INSERT INTO tasks(company_id,title,created_by,assigned_to) VALUES($1,'既存課題',$2,$2)", [company, actor])
await db.query("INSERT INTO auth_mfa_credentials(user_id,environment,version,secret_encrypted,confirmed_at) VALUES($1,'local',$2,'fixture',now())", [actor, credential])
await db.query("INSERT INTO user_sessions(user_id,token_hash,expires_at,mfa_version,auth_environment) VALUES($1,$2,now()+interval '1 hour',$3,'local')", [actor, createHash('sha256').update(session).digest('hex'), credential])
const fixtureErrors: string[] = []
async function query(q: { query: string; params: unknown[] }, client: { query: typeof db.query } = db) {
  const result = await client.query<Record<string, unknown>>(q.query, q.params)
  return { fields: result.fields, rows: result.rows.map(row => result.fields.map(f => {
    const value = row[f.name]
    if (value == null) return null
    if (value instanceof Date) return value.toISOString().replace('T', ' ').replace('Z', '+00')
    if (typeof value === 'object') return JSON.stringify(value)
    if (typeof value === 'boolean') return value ? 't' : 'f'
    return String(value)
  })), rowCount: result.affectedRows ?? result.rows.length, command: 'SELECT', rowAsArray: true }
}
const fixture = createServer(async (req, res) => {
  if (req.headers['x-fixture'] !== nonce) { res.writeHead(403).end(); return }
  try {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk))
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    const response = Array.isArray(data.queries)
      ? { results: await db.transaction(async tx => { const rows = []; for (const q of data.queries) rows.push(await query(q, tx)); return rows }) }
      : await query(data)
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(response))
  } catch (error) {
    fixtureErrors.push(error instanceof Error ? error.message : String(error))
    res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ message: 'Fixture query failed' }))
  }
})
fixture.listen(0, '127.0.0.1'); await once(fixture, 'listening')
const reserve = createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening')
const port = (reserve.address() as { port: number }).port
await new Promise<void>(done => reserve.close(() => done()))
const origin = `http://127.0.0.1:${port}`
await mkdir('.local-test/tasks-browser', { recursive: true })
const child = spawn(process.execPath, ['--no-wasm-tier-up', '--no-liftoff', resolve('node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  windowsHide: true, env: { ...process.env,
    NODE_OPTIONS: `--import ${pathToFileURL(resolve('tests/helpers/task-browser-runtime.mjs')).href}`,
    DATABASE_URL: 'postgresql://fixture:fixture@task-fixture.neon.tech/fixture',
    OTP_USER_ID: actor, MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64'), LOCAL_AUTH_ENABLED: 'false',
    TASK_BROWSER_FIXTURE: `http://127.0.0.1:${(fixture.address() as { port: number }).port}`, TASK_BROWSER_NONCE: nonce,
    VERCEL: '', VERCEL_ENV: '', NEXT_TELEMETRY_DISABLED: '1', BILLING_LIVE_SEND_ENABLED: 'false',
    BULK_MAIL_ENABLED: 'false', BULK_MAIL_LOCAL_ENABLED: 'false', BULK_MAIL_TEST_ENABLED: 'false', BULK_MAIL_LIVE_SEND_ENABLED: 'false',
    RAW_INGEST_ENABLED: 'false', RAW_EXTRACTION_ENABLED: 'false', RAW_APPLY_ENABLED: 'false', RAW_SYNC_ENABLED: 'false',
  },
})
const logs: string[] = []
child.stdout.on('data', d => logs.push(String(d))); child.stderr.on('data', d => logs.push(String(d)))
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
let page: import('@playwright/test').Page | undefined
const errors: string[] = []
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(origin + '/login', { signal: AbortSignal.timeout(2000) })).ok) break } catch {}
    if (child.exitCode !== null || i === 79) throw new Error('Fixture app startup failed')
    await new Promise(done => setTimeout(done, 500))
  }
  console.log('Fixture server ready')
  browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addCookies([{ name: 'acoru_session', value: session, url: origin, httpOnly: true, sameSite: 'Strict' }])
  page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(origin + '/tasks')
  await expect(page.getByRole('heading', { name: '課題管理', exact: true })).toBeVisible()
  for (const name of ['AIアシスタント', '活動履歴', 'ファイル', 'レポート', 'タスク']) await expect(page.getByRole('navigation').getByRole('link', { name, exact: true })).toHaveCount(0)
  const headers = async () => (await page!.locator('thead tr').first().locator('th').allTextContents()).map(text => text.replace(/[↕↑↓]/g, ''))
  expect(await headers()).toEqual(['', '#', 'No', '起票日', '内容', '完了条件', '期限', '進捗', '状態', '操作'])
  await page.getByLabel('追加する顧客').selectOption(other)
  await page.getByRole('button', { name: '顧客タブを追加' }).click()
  await expect(page.getByRole('tab', { name: '未契約の顧客', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.reload()
  await expect(page.getByRole('tab', { name: '未契約の顧客', exact: true })).toBeVisible()
  // New rows are entered on the grid's first line; there is no separate form or page.
  await expect(page.locator('summary').filter({ hasText: '課題を追加' })).toHaveCount(0)
  await page.getByLabel('新しい課題: 起票日', { exact: true }).fill('2026-10-29')
  await page.getByLabel('新しい課題: 内容', { exact: true }).fill('見積条件を確認\n担当者へ連絡')
  await page.getByLabel('新しい課題: 完了条件', { exact: true }).fill('書面で合意する')
  await page.getByLabel('新しい課題: 期限', { exact: true }).fill('2000-01-01')
  await page.getByLabel('新しい課題: 進捗', { exact: true }).fill('先方へ確認中')
  await page.getByLabel('新しい課題: 状態', { exact: true }).selectOption('in_progress')
  await page.getByRole('button', { name: '＋ 追加', exact: true }).click()
  await expect(page.getByRole('cell', { name: /見積条件を確認/ })).toBeVisible()
  const row = page.getByRole('row').filter({ hasText: '見積条件を確認' })
  await expect(row.getByRole('cell').nth(8)).toHaveText('対応中')
  await expect(row.getByText('期限超過', { exact: true })).toBeVisible()
  // Edit in place: double-click a cell, type, Enter.
  const urlBeforeEdit = page.url()
  await row.getByRole('cell').nth(2).dblclick()
  await page.getByLabel('Noを編集', { exact: true }).fill('5')
  await page.getByLabel('Noを編集', { exact: true }).press('Enter')
  await expect(row.getByRole('cell').nth(2)).toHaveText(/^5/)
  await row.getByRole('cell').nth(5).dblclick()
  await page.getByLabel('完了条件を編集', { exact: true }).fill('見積を承認する')
  await page.getByLabel('完了条件を編集', { exact: true }).press('Enter')
  await expect(page.getByRole('cell', { name: /^見積を承認する/ })).toBeVisible()
  await row.getByRole('cell').nth(8).dblclick()
  // Choosing from the dropdown must save on its own, without Enter or leaving the cell.
  await page.getByLabel('状態を編集', { exact: true }).selectOption('not_needed')
  await expect(row.getByRole('cell').nth(8)).toHaveText(/^不要/)
  expect(page.url()).toBe(urlBeforeEdit)
  await expect(page.getByText('期限超過', { exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('row').filter({ hasText: '見積条件を確認' }).getByRole('cell').nth(8)).toHaveText('不要')
  const saved = (await db.query<{ status: string; issue_number: number; completion_criteria: string }>('SELECT status, issue_number, completion_criteria FROM tasks WHERE company_id=$1', [other])).rows[0]
  expect(saved).toEqual({ status: 'not_needed', issue_number: 5, completion_criteria: '見積を承認する' })
  const taskId = (await db.query<{ id: string }>('SELECT id FROM tasks WHERE company_id=$1', [other])).rows[0].id
  await page.goto(origin + '/tasks/' + taskId + '/edit')
  await expect(page).toHaveURL(new RegExp('/tasks\\?company=' + other + '$'))
  console.log('Create/edit/status/reload passed')
  await page.screenshot({ path: '.local-test/tasks-browser/desktop.png', fullPage: true })
  await page.getByRole('tab', { name: '既存顧客', exact: true }).click()
  await expect(page.getByRole('cell', { name: '既存課題', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: /見積条件を確認/ })).toHaveCount(0)
  await page.getByRole('tab', { name: '未契約の顧客', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: 'ナビゲーションを展開', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  expect(await page.locator('.app-content').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  await page.screenshot({ path: '.local-test/tasks-browser/mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '課題 No 5 を削除', exact: true }).click()
  await expect(page.getByText('課題がありません', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('tab', { name: '未契約の顧客', exact: true })).toBeVisible()
  for (const path of ['/assistant', '/activities', '/files', '/reports', '/api/assistant/threads', '/api/ai/summarize-company', '/api/agent/changes/' + randomUUID(), '/api/deals/' + randomUUID() + '/agent']) {
    expect((await context.request.get(origin + path)).status(), path).toBe(404)
  }
  await page.goto(origin + '/dashboard')
  await expect(page.getByText('期限切れ課題', { exact: true })).toBeVisible()
  await expect(page.getByText('最近の活動履歴', { exact: true })).toHaveCount(0)
  await db.query("UPDATE users SET role='viewer' WHERE id=$1", [actor])
  await page.goto(origin + '/tasks')
  await expect(page.getByRole('button', { name: '顧客タブを追加' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /課題 No .* を削除/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '＋ 追加', exact: true })).toHaveCount(0)
  await page.getByRole('cell', { name: '既存課題', exact: true }).dblclick()
  await expect(page.getByLabel('内容を編集', { exact: true })).toHaveCount(0)
  expect(errors).toEqual([]); expect(fixtureErrors).toEqual([])
  console.log('PASS: customer tabs persisted; inactive/uncontracted customer accepted; grid columns; in-grid create/edit/status/reload/delete; legacy edit URL redirects; customer isolation; mobile; viewer restrictions; retired routes 404. Isolated DB only.')
} catch (error) {
  await page?.screenshot({ path: '.local-test/tasks-browser/failure.png', fullPage: true }).catch(() => {})
  console.error(error instanceof Error ? error.message : error)
  console.error('Fixture:', fixtureErrors, 'Browser:', errors)
  console.error(logs.filter(line => /error|failed/i.test(line)).join('\n').replaceAll(session, '[fixture-session]').slice(-3000))
  process.exitCode = 1
} finally {
  await browser?.close()
  if (child.exitCode === null) { child.kill(); await once(child, 'exit').catch(() => {}) }
  await new Promise<void>(done => fixture.close(() => done()))
  await db.close()
}
