import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { PDFDocument } from 'pdf-lib'
import {
  defaults,
  invoiceDates,
  japanClock,
  previousPeriod,
  totals,
  assertRecipient,
  type Customer,
} from '../lib/billing/domain'
import { BillingRepository } from '../lib/billing/repository'
import { deliver, scheduledRun } from '../lib/billing/service'
import { createInvoicePdf } from '../lib/billing/pdf'

const customer: Customer = {
  id: 'T1',
  name: '検証株式会社',
  email: 'test@example.invalid',
  honorific: '御中',
  status: '契約中',
  paymentTerm: '翌々月10日',
  lines: [{ name: 'システム保守', quantity: 1, unitPrice: 100000 }],
  version: 0,
}
async function setup() {
  const db = new PGlite()
  await db.exec(`CREATE TABLE companies(id uuid PRIMARY KEY,name text,status text DEFAULT 'active',address text,postal_code text,deleted_at timestamptz);
    CREATE TABLE contacts(id uuid PRIMARY KEY,company_id uuid,name text,email text,deleted_at timestamptz);
    CREATE TABLE deals(id uuid PRIMARY KEY,company_id uuid,title text,amount bigint,created_at timestamptz DEFAULT now(),deleted_at timestamptz);`)
  await db.exec(await readFile('scripts/db/migrations/004_billing.sql', 'utf8'))
  await db.exec(
    await readFile('scripts/db/migrations/006_crm_billing.sql', 'utf8'),
  )
  const repo = new BillingRepository({
    query: async (text, params) =>
      (await db.query(text, params)).rows as Record<string, unknown>[],
  })
  await repo.saveCustomer(customer, 0, 'test')
  return { db, repo }
}
test('due dates cover leap years, year boundary and all terms', () => {
  assert.equal(invoiceDates('2026-12', '翌々月10日').dueDate, '2027-02-10')
  assert.equal(invoiceDates('2028-01', '翌月末日').dueDate, '2028-02-29')
  assert.equal(invoiceDates('2026-09', '翌月10日').dueDate, '2026-10-10')
  assert.equal(invoiceDates('2026-09', '翌々月1日').dueDate, '2026-11-01')
  assert.throws(() => invoiceDates('2026-13', '翌月10日'))
  assert.equal(previousPeriod('2026-01'), '2025-12')
  assert.deepEqual(japanClock(new Date('2026-09-30T15:00:00Z')), {
    period: '2026-10',
    day: 1,
    hour: 0,
  })
})
test('money validation and fail-closed recipient policy', () => {
  assert.deepEqual(totals([{ name: '保守', quantity: 3, unitPrice: 333 }]), {
    subtotal: 999,
    tax: 99,
    total: 1098,
  })
  assert.throws(() => totals([{ name: '保守', quantity: -1, unitPrice: 100 }]))
  assert.throws(() => assertRecipient('customer@real-company.jp'))
  assertRecipient('customer@example.invalid')
})
test('concurrent generation, immutable snapshots, optimistic conflicts, audit', async () => {
  const { db, repo } = await setup()
  try {
    const runs = await Promise.all([
      repo.generate('2026-09', 'test'),
      repo.generate('2026-09', 'test'),
    ])
    assert.equal(
      runs.reduce((s, r) => s + r.created, 0),
      1,
    )
    const first = (await repo.invoices())[0]
    await repo.saveCustomer(
      {
        ...customer,
        email: 'changed@example.invalid',
        lines: [{ name: '変更後', quantity: 1, unitPrice: 200000 }],
      },
      1,
      'test',
    )
    assert.throws(() => assertRecipient('customer@acoru.jp'))
    assert.equal(
      (await repo.invoice(first.id)).document.email,
      'test@example.invalid',
    )
    assert.equal((await repo.invoice(first.id)).total, 110000)
    await assert.rejects(() => repo.saveCustomer(customer, 1, 'test'))
    await repo.updateInvoice(first.id, 1, first.document, 'held', 'test')
    await assert.rejects(() =>
      repo.updateInvoice(first.id, 1, first.document, 'draft', 'test'),
    )
    assert.ok((await repo.events()).length >= 4)
  } finally {
    await db.close()
  }
})
test('test sends cannot call provider; concurrent simulation is idempotent; sent cannot edit', async () => {
  const { db, repo } = await setup()
  try {
    await repo.generate('2026-09', 'test')
    let calls = 0
    const options = {
      live: false,
      pdf: async () => Buffer.from('test-pdf'),
      fetcher: async () => {
        calls++
        throw Error('must never call')
      },
    }
    await Promise.all([
      deliver(repo, 'INV-202609-T1', 'test', options),
      deliver(repo, 'INV-202609-T1', 'test', options),
    ])
    assert.equal(calls, 0)
    assert.equal((await repo.deliveries()).length, 1)
    assert.equal((await repo.invoice('INV-202609-T1')).status, 'simulated')
    await assert.rejects(() =>
      deliver(repo, 'INV-202609-T1', 'test', {
        ...options,
        live: true,
        apiKey: 'fake',
      }),
    )
    assert.equal(calls, 0)
    await db.query(
      "UPDATE billing.invoices SET status='sent' WHERE id='INV-202609-T1'",
    )
    const inv = await repo.invoice('INV-202609-T1')
    await assert.rejects(() =>
      repo.updateInvoice(inv.id, inv.version, inv.document, 'draft', 'test'),
    )
  } finally {
    await db.close()
  }
})
test('uncertain provider outcome blocks every subsequent send, including concurrent attempts', async () => {
  const { db, repo } = await setup()
  try {
    await repo.generate('2026-09', 'test')
    await db.query(
      `UPDATE billing.invoices SET document=jsonb_set(jsonb_set(jsonb_set(document,'{email}','"qa@example.com"'),'{issuer,bank}','"検証銀行"'),'{issuer,registration}','"T9999999999999"')`,
    )
    let calls = 0
    const options = {
      live: true,
      apiKey: 'fake',
      pdf: async () => Buffer.from('pdf'),
      fetcher: async () => {
        calls++
        throw Error('timeout')
      },
    }
    await Promise.allSettled([
      deliver(repo, 'INV-202609-T1', 'test', options),
      deliver(repo, 'INV-202609-T1', 'test', options),
    ])
    assert.equal(calls, 1)
    assert.equal((await repo.invoice('INV-202609-T1')).status, 'uncertain')
    await assert.rejects(() => deliver(repo, 'INV-202609-T1', 'test', options))
    assert.equal(calls, 1)
    assert.equal((await repo.deliveries()).length, 1)
  } finally {
    await db.close()
  }
})
test('scheduler uses JST, preserves held invoices and excludes old backlog', async () => {
  const { db, repo } = await setup()
  try {
    await repo.saveSettings({ ...defaults, automation: true }, 0, 'test')
    await repo.generate('2026-07', 'test')
    const options = { live: false, pdf: async () => Buffer.from('pdf') }
    assert.equal(
      (await scheduledRun(repo, options, new Date('2026-09-24T23:59:00Z')))
        .created,
      0,
    )
    assert.equal(
      (await scheduledRun(repo, options, new Date('2026-09-25T00:00:00Z')))
        .created,
      1,
    )
    assert.equal(
      (await scheduledRun(repo, options, new Date('2026-09-30T23:59:00Z')))
        .processed,
      0,
    )
    assert.equal(
      (await scheduledRun(repo, options, new Date('2026-10-01T00:00:00Z')))
        .processed,
      1,
    )
    assert.equal((await repo.invoice('INV-202607-T1')).status, 'draft')
    assert.equal(
      (await scheduledRun(repo, options, new Date('2026-10-01T01:00:00Z')))
        .processed,
      0,
    )
  } finally {
    await db.close()
  }
})
test('Japanese PDF supports more than seven items with page totals', async () => {
  const { db, repo } = await setup()
  try {
    await repo.generate('2026-09', 'test')
    const inv = await repo.invoice('INV-202609-T1')
    inv.document.lines = Array.from({ length: 25 }, (_, i) => ({
      name: `システム保守・運用支援 ${i + 1}`,
      quantity: 1,
      unitPrice: 12345,
    }))
    Object.assign(inv, totals(inv.document.lines))
    const pdf = await createInvoicePdf(inv)
    assert.ok((await PDFDocument.load(pdf)).getPageCount() >= 3)
    await mkdir('.local-test', { recursive: true })
    await writeFile('.local-test/billing-many-lines.pdf', pdf)
    inv.document.lines = customer.lines
    Object.assign(inv, totals(customer.lines))
    await writeFile(
      '.local-test/billing-single.pdf',
      await createInvoicePdf(inv),
    )
  } finally {
    await db.close()
  }
})
