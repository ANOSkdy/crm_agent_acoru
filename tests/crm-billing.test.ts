import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { BillingRepository } from '../lib/billing/repository'
import { defaults, japanClock } from '../lib/billing/domain'
import { deliver, scheduledRun } from '../lib/billing/service'

async function setup() {
  const db = new PGlite()
  await db.exec(`CREATE TABLE companies(id uuid PRIMARY KEY,name text,status text DEFAULT 'active',address text,postal_code text,deleted_at timestamptz);
    CREATE TABLE contacts(id uuid PRIMARY KEY,company_id uuid,name text,email text,deleted_at timestamptz);
    CREATE TABLE deals(id uuid PRIMARY KEY,company_id uuid,title text,amount bigint,created_at timestamptz DEFAULT now(),deleted_at timestamptz);`)
  await db.exec(await readFile('scripts/db/migrations/004_billing.sql', 'utf8'))
  await db.exec(
    await readFile('scripts/db/migrations/006_crm_billing.sql', 'utf8'),
  )
  const dbAdapter = {
    query: async (q: string, p?: unknown[]) =>
      (await db.query(q, p)).rows as Record<string, unknown>[],
  }
  const repo = new BillingRepository(dbAdapter),
    company = randomUUID(),
    contact = randomUUID(),
    deal = randomUUID()
  await db.query(
    'INSERT INTO companies(id,name,address,postal_code) VALUES ($1,$2,$3,$4)',
    [company, 'テスト顧客株式会社', '札幌市の検証用住所', '000-0000'],
  )
  await db.query(
    'INSERT INTO contacts(id,company_id,name,email) VALUES ($1,$2,$3,$4)',
    [contact, company, '請求担当', 'never-copy@example.com'],
  )
  await db.query(
    'INSERT INTO deals(id,company_id,title,amount) VALUES ($1,$2,$3,$4)',
    [deal, company, '導入支援', 50000],
  )
  await repo.saveSettings(defaults, 0, 'test')
  return { db, repo, company, contact, deal }
}
test('PDF subject snapshots the selected deal when the registered subject is blank', async () => {
  const { db, repo, company, deal } = await setup()
  try {
    await db.query('INSERT INTO deals(id,company_id,title,amount) VALUES ($1,$2,$3,$4)', [randomUUID(), company, '別案件', 10000])
    const customer = (await repo.customers())[0]
    await repo.saveCustomer({ ...customer, sourceDealId: deal, subject: '　 ', billingEnabled: true }, 0, 'test')
    const invoice = (await repo.invoices())[0]
    assert.equal(invoice.document.subject, '')
    assert.equal(invoice.document.dealTitle, '導入支援')
    await db.query('UPDATE deals SET title=$1 WHERE id=$2', ['変更後の案件名', deal])
    assert.equal((await repo.invoice(invoice.id)).document.dealTitle, '導入支援')
  } finally {
    await db.close()
  }
})

test('CRM toggle creates provisional invoice atomically, keeps dummy recipient, blocks duplicates and disabled sends', async () => {
  const { db, repo, company } = await setup()
  try {
    const customer = (await repo.customers())[0]
    assert.equal(customer.companyId, company)
    assert.equal(customer.billingEnabled, false)
    assert.equal(customer.lines[0].unitPrice, 50000)
    await repo.saveCustomer({ ...customer, billingEnabled: true }, 0, 'test')
    const invoices = await repo.invoices(japanClock().period)
    assert.equal(invoices.length, 1)
    assert.equal(invoices[0].status, 'held')
    assert.equal(invoices[0].document.provisional, true)
    assert.equal(invoices[0].company_id, company)
    assert.match(invoices[0].document.email, /@example.invalid$/)
    assert.equal(invoices[0].document.address, '札幌市の検証用住所')
    assert.equal((await repo.generate(japanClock().period, 'test')).created, 0)
    await assert.rejects(
      deliver(repo, invoices[0].id, 'test', {
        live: false,
        pdf: async () => Buffer.from('pdf'),
      }),
    )
    await repo.updateInvoice(
      invoices[0].id,
      invoices[0].version,
      invoices[0].document,
      'draft',
      'test',
    )
    assert.equal(
      (await repo.invoice(invoices[0].id)).document.provisional,
      false,
    )
    const configured = (await repo.customers())[0]
    await repo.saveCustomer(
      { ...configured, billingEnabled: false },
      configured.version,
      'test',
    )
    await assert.rejects(
      deliver(repo, invoices[0].id, 'test', {
        live: false,
        pdf: async () => Buffer.from('pdf'),
      }),
      /無効/,
    )
    assert.equal((await repo.invoices()).length, 1)
    assert.equal((await repo.generate('2028-05', 'test')).created, 0)
  } finally {
    await db.close()
  }
})
test('an explicit invoice recipient is preserved when a stored customer has no selected contact', async () => {
  const { db, repo } = await setup()
  try {
    const productionRepo = new BillingRepository(repo.db, true)
    const customer = (await productionRepo.customers())[0]
    assert.equal(customer.email, '')
    await productionRepo.saveCustomer({ ...customer, email: 'invoice@example.com', contactId: null, billingEnabled: false }, 0, 'test', true)
    const saved = (await productionRepo.customers())[0]
    assert.equal(saved.contactId, null)
    assert.equal(saved.email, 'invoice@example.com')
    const document = await productionRepo.document(saved, '2026-10', defaults)
    assert.equal(document.email, 'invoice@example.com')
    assert.equal((await productionRepo.invoices()).length, 0)
  } finally { await db.close() }
})

test('confirmed activation and scheduled delivery use the explicit billing recipient even with a selected contact', async () => {
  const { db, repo, contact } = await setup()
  try {
    const productionRepo = new BillingRepository(repo.db, true)
    await productionRepo.saveSettings({ ...defaults, automation: true, issuer: {
      ...defaults.issuer, bank: '振込先設定済み', registration: 'T1234567890123',
    } }, 1, 'test')
    const customer = (await productionRepo.customers())[0]
    await productionRepo.saveCustomer({ ...customer, email: 'invoice@example.com', contactId: contact, billingEnabled: true, templateConfirmed: true }, 0, 'test', true)
    const invoice = (await productionRepo.invoices())[0]
    assert.equal(invoice.status, 'draft')
    assert.equal(invoice.document.provisional, false)
    assert.equal(invoice.document.email, 'invoice@example.com')
    assert.equal((await productionRepo.generate(invoice.period, 'test')).created, 0)
    const [year, month] = invoice.period.split('-').map(Number)
    const sendingTime = new Date(Date.UTC(year, month, 1)) // following month, 09:00 JST
    let sent = 0
    const options = { live: true, apiKey: 'mock-key', pdf: async () => Buffer.from('pdf'), fetcher: (async (_url, init) => {
      const payload = JSON.parse(String(init?.body))
      assert.deepEqual(payload.to, ['invoice@example.com'])
      sent++
      return new Response(JSON.stringify({ id: 'mock-delivery' }), { status: 200 })
    }) as typeof fetch }
    assert.equal((await scheduledRun(productionRepo, options, sendingTime)).processed, 1)
    assert.equal((await scheduledRun(productionRepo, options, sendingTime)).processed, 0)
    assert.equal(sent, 1)
    assert.equal((await productionRepo.invoice(invoice.id)).status, 'sent')
    assert.equal((await productionRepo.deliveries(invoice.id))[0].recipient, 'invoice@example.com')
  } finally { await db.close() }
})

test('monthly generation keeps the billing address when contact email changes or is removed', async () => {
  const { db, repo, contact } = await setup()
  try {
    const productionRepo = new BillingRepository(repo.db, true)
    const customer = (await productionRepo.customers())[0]
    await productionRepo.saveCustomer({ ...customer, email: 'invoice@example.com', contactId: contact, billingEnabled: true, templateConfirmed: true }, 0, 'test', true)
    const initial = (await productionRepo.invoices())[0]
    const [year, month] = initial.period.split('-').map(Number)
    const nextPeriod = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7)
    const laterPeriod = new Date(Date.UTC(year, month + 1, 1)).toISOString().slice(0, 7)

    await db.query('UPDATE contacts SET email=$1 WHERE id=$2', ['changed-contact@example.com', contact])
    assert.equal((await productionRepo.generate(nextPeriod, 'cron')).created, 1)
    assert.equal((await productionRepo.invoices(nextPeriod))[0].document.email, 'invoice@example.com')

    await db.query('UPDATE contacts SET email=NULL WHERE id=$1', [contact])
    const saved = (await productionRepo.customers())[0]
    await productionRepo.saveCustomer({ ...saved, email: 'new-billing@example.com' }, saved.version, 'test', true)
    assert.equal((await productionRepo.generate(laterPeriod, 'cron')).created, 1)
    assert.equal((await productionRepo.invoices(laterPeriod))[0].document.email, 'new-billing@example.com')
    assert.deepEqual(await productionRepo.invoice(initial.id), initial)
    assert.equal((await productionRepo.invoices(nextPeriod))[0].document.email, 'invoice@example.com')
  } finally { await db.close() }
})

test('confirming settings updates only the current untouched provisional invoice', async () => {
  const { db, repo } = await setup()
  try {
    const customer = (await repo.customers())[0]
    await repo.saveCustomer({ ...customer, billingEnabled: true }, 0, 'test')
    const current = (await repo.invoices())[0]
    await repo.generate('2025-01', 'test')
    const old = (await repo.invoices('2025-01'))[0]
    const saved = (await repo.customers())[0]
    const result = await repo.saveCustomer({ ...saved, templateConfirmed: true, lines: [{name:'月次保守',quantity:1,unitPrice:70000}] }, saved.version, 'test')
    assert.match(result!.message, /送信待ち/)
    const confirmed = await repo.invoice(current.id)
    assert.equal(confirmed.status, 'draft')
    assert.equal(confirmed.document.provisional, false)
    assert.equal(confirmed.total, 77000)
    assert.equal(confirmed.version, 2)
    assert.deepEqual(await repo.invoice(old.id), old)
    const ready = (await repo.customers())[0]
    await repo.saveCustomer({ ...ready, lines: [{name:'新しい月額',quantity:1,unitPrice:80000}] }, ready.version, 'test')
    assert.deepEqual(await repo.invoice(current.id), confirmed)
    assert.equal((await repo.invoices()).length, 2)
  } finally { await db.close() }
})

test('saving confirmed settings never releases a manually held or edited invoice', async () => {
  const { db, repo } = await setup()
  try {
    const customer = (await repo.customers())[0]
    await repo.saveCustomer({ ...customer, billingEnabled: true }, 0, 'test')
    const current = (await repo.invoices())[0]
    await repo.updateInvoice(current.id, current.version, { ...current.document, subject: '個別調整' }, 'held', 'test')
    const manuallyHeld = await repo.invoice(current.id)
    const saved = (await repo.customers())[0]
    await repo.saveCustomer({ ...saved, templateConfirmed: true }, saved.version, 'test')
    assert.deepEqual(await repo.invoice(current.id), manuallyHeld)
    await repo.generate('2028-08', 'test')
    assert.equal((await repo.invoices('2028-08'))[0].status, 'draft')
  } finally { await db.close() }
})

test('CRM changes affect future snapshots only; foreign contacts/deals and stale edits are rejected', async () => {
  const { db, repo, company } = await setup()
  try {
    const customer = (await repo.customers())[0]
    await assert.rejects(
      repo.saveCustomer({ ...customer, contactId: randomUUID() }, 0, 'test'),
      /所属/,
    )
    await assert.rejects(
      repo.saveCustomer({ ...customer, sourceDealId: randomUUID() }, 0, 'test'),
      /所属/,
    )
    await repo.saveCustomer(
      { ...customer, billingEnabled: true, templateConfirmed: true },
      0,
      'test',
    )
    await assert.rejects(
      repo.saveCustomer({ ...customer, billingEnabled: true }, 0, 'test'),
      /更新/,
    )
    await db.query('UPDATE companies SET name=$2 WHERE id=$1', [
      company,
      '変更後株式会社',
    ])
    await repo.generate('2028-05', 'test')
    assert.equal(
      (await repo.invoices('2028-05'))[0].document.name,
      '変更後株式会社',
    )
    assert.equal(
      (await repo.invoices(japanClock().period))[0].document.name,
      'テスト顧客株式会社',
    )
    assert.equal((await repo.invoices('2028-05'))[0].status, 'draft')
    await db.query('UPDATE companies SET deleted_at=now() WHERE id=$1', [
      company,
    ])
    assert.equal((await repo.generate('2028-06', 'test')).created, 0)
  } finally {
    await db.close()
  }
})
