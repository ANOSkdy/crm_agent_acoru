import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { BillingRepository } from '../lib/billing/repository'
import { defaults, japanClock } from '../lib/billing/domain'
import { deliver } from '../lib/billing/service'

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
