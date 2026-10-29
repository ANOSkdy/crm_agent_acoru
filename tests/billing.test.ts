import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { PDFDocument, PDFArray, PDFDict, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import {
  defaults,
  invoiceDates,
  japanClock,
  previousPeriod,
  totals,
  assertRecipient,
  documentSubject,
  type Customer,
} from '../lib/billing/domain'
import { BillingRepository } from '../lib/billing/repository'
import { deliver, scheduledRun } from '../lib/billing/service'
import { createInvoicePdf, createBusinessDocumentPdf } from '../lib/billing/pdf'
import { templateDocument, templateInputSchema } from '../lib/billing/template'

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
test('disabled sending cannot call provider or create delivery records; sent cannot edit', async () => {
  const { db, repo } = await setup()
  try {
    await repo.generate('2026-09', 'test')
    let calls = 0
    const options = {
      live: false,
      pdf: async () => { throw Error('Disabled sending must not create a PDF') },
      fetcher: async () => {
        calls++
        throw Error('must never call')
      },
    }
    await Promise.all([
      assert.rejects(() => deliver(repo, 'INV-202609-T1', 'test', options), /停止中/),
      assert.rejects(() => deliver(repo, 'INV-202609-T1', 'test', options), /停止中/),
    ])
    assert.equal(calls, 0)
    assert.equal((await repo.deliveries()).length, 0)
    assert.equal((await repo.invoice('INV-202609-T1')).status, 'draft')
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
async function prepareSendableInvoices(db: PGlite) {
  await db.query(`UPDATE billing.invoices SET document=jsonb_set(jsonb_set(jsonb_set(document,'{email}','"qa@example.com"'),'{issuer,bank}','"銀行"'),'{issuer,registration}','"T9999999999999"') WHERE status='draft'`)
}
function mockSendOptions() {
  return {
    live: true,
    apiKey: 'fake',
    pdf: async () => Buffer.from('pdf'),
    fetcher: async () => new Response(JSON.stringify({ id: 'mock-accepted' }), { status: 200 }),
  }
}
test('scheduler uses JST, preserves held invoices and excludes old backlog', async () => {
  const { db, repo } = await setup()
  try {
    await repo.saveSettings({ ...defaults, automation: true }, 0, 'test')
    await repo.generate('2026-07', 'test')
    const options = mockSendOptions()
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
    await prepareSendableInvoices(db)
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
    await repo.generate('2026-10', 'test')
    assert.equal((await scheduledRun(repo, options, new Date('2026-11-04T00:00:00Z'))).processed, 0)
    assert.equal((await scheduledRun(repo, options, new Date('2026-11-29T00:00:00Z'))).created, 0)
    assert.equal(
      (await scheduledRun(repo, options, new Date('2026-10-01T01:00:00Z')))
        .processed,
      0,
    )
  } finally {
    await db.close()
  }
})

test('monthly scheduler processes more than ten eligible invoices with a mocked provider', async () => {
  const { db, repo } = await setup()
  try {
    await repo.saveSettings({ ...defaults, automation: true }, 0, 'test')
    for (let i = 2; i <= 12; i++) await repo.saveCustomer({ ...customer, id: `T${i}` }, 0, 'test')
    const options = mockSendOptions()
    const created = await scheduledRun(repo, options, new Date('2026-12-25T00:00:00Z'))
    assert.equal(created.created, 12)
    assert.equal(created.processed, 0)
    await prepareSendableInvoices(db)
    const sent = await scheduledRun(repo, options, new Date('2027-01-01T00:00:00Z'))
    assert.equal(sent.processed, 12)
    assert.equal(sent.errors, 0)
    assert.equal(sent.remaining, 0)
    assert.equal((await scheduledRun(repo, options, new Date('2027-01-01T00:10:00Z'))).processed, 0)
    const config = JSON.parse(await readFile('vercel.json', 'utf8'))
    assert.deepEqual(config.crons, [{ path: '/api/cron/billing', schedule: '0 0 1-3,25-28 * *' }])
  } finally {
    await db.close()
  }
})

test('sending buffer covers days 1-3, retries pre-send failures and excludes accepted or uncertain deliveries', async () => {
  const { db, repo } = await setup()
  try {
    await repo.saveSettings({ ...defaults, automation: true }, 0, 'test')
    for (const id of ['T2', 'T3']) await repo.saveCustomer({ ...customer, id }, 0, 'test')
    await repo.generate('2026-12', 'test')
    await db.query("UPDATE billing.invoices SET status='uncertain' WHERE customer_id='T3'")
    let ready = false
    const options = { ...mockSendOptions(), pdf: async () => { if (!ready) throw Error('Pre-send generation failure'); return Buffer.from('pdf') } }
    await prepareSendableInvoices(db)
    assert.equal((await scheduledRun(repo, options, new Date('2027-01-01T00:00:00Z'))).errors, 2)
    assert.equal((await repo.deliveries()).length, 0)
    ready = true
    assert.equal((await scheduledRun(repo, options, new Date('2027-01-02T00:00:00Z'))).processed, 2)
    assert.equal((await scheduledRun(repo, options, new Date('2027-01-03T00:00:00Z'))).processed, 0)
    assert.equal((await repo.invoice('INV-202612-T3')).status, 'uncertain')
    await repo.saveCustomer({ ...customer, id: 'T4' }, 0, 'test')
    await repo.generate('2026-12', 'test')
    await prepareSendableInvoices(db)
    assert.equal((await scheduledRun(repo, options, new Date('2027-01-03T01:00:00Z'))).processed, 1)
    await repo.saveCustomer({ ...customer, id: 'T5' }, 0, 'test')
    await repo.generate('2026-12', 'test')
    assert.equal((await scheduledRun(repo, options, new Date('2027-01-04T00:00:00Z'))).processed, 0)
  } finally {
    await db.close()
  }
})

test('disabled scheduled sending leaves invoices and delivery history untouched', async () => {
  const { db, repo } = await setup()
  try {
    await repo.saveSettings({ ...defaults, automation: true }, 0, 'test')
    await repo.generate('2026-09', 'test')
    const result = await scheduledRun(repo, {
      live: false,
      pdf: async () => { throw Error('Must not create PDF') },
      fetcher: async () => { throw Error('Must not send mail') },
    }, new Date('2026-10-01T00:00:00Z'))
    assert.equal(result.processed, 0)
    assert.equal(result.errors, 0)
    assert.equal((await repo.deliveries()).length, 0)
    assert.equal((await repo.invoices())[0].status, 'draft')
  } finally { await db.close() }
})

test('creation retries on 25-28 only, fills missing invoices and never sends on creation days', async () => {
  const { db, repo } = await setup()
  try {
    await repo.saveSettings({ ...defaults, automation: true }, 0, 'test')
    await repo.generate('2026-08', 'test')
    const options = { live: false, pdf: async () => { throw Error('Creation must not send') } }
    for (let day = 25; day <= 28; day++) {
      if (day > 25) await repo.saveCustomer({ ...customer, id: `T${day}` }, 0, 'test')
      const now = new Date(`2026-09-${day}T00:00:00Z`)
      const result = await scheduledRun(repo, options, now)
      assert.equal(result.created, 1)
      assert.equal(result.processed, 0)
      assert.equal((await scheduledRun(repo, options, now)).created, 0)
    }
    await repo.saveCustomer({ ...customer, id: 'TOO-LATE' }, 0, 'test')
    assert.equal((await scheduledRun(repo, options, new Date('2026-09-29T00:00:00Z'))).created, 0)
    assert.equal((await repo.invoices('2026-09')).length, 4)
    assert.equal((await repo.invoice('INV-202608-T1')).status, 'draft')
  } finally {
    await db.close()
  }
})
async function pdfTextBlocks(bytes: Uint8Array, pageIndex = 0) {
  const pdf = await PDFDocument.load(bytes)
  const contents = pdf.getPage(pageIndex).node.Contents()
  assert.ok(contents instanceof PDFArray)
  const operators = contents.asArray().map(ref => {
    const stream = pdf.context.lookup(ref)
    assert.ok(stream instanceof PDFRawStream)
    return Buffer.from(decodePDFRawStream(stream).decode()).toString()
  }).join('\n')
  return [...operators.matchAll(/BT\s([\s\S]*?)ET/g)].map(match => match[1])
}

test('invoice and quotation PDFs preserve standard sizes and fit long recipients on one line', async () => {
  for (const kind of ['invoice', 'quotation'] as const) {
    const input = templateInputSchema.parse({
      kind, name: 'TEST株式会社', honorific: '御中', subject: '業務最適解PJ',
      issueDate: '2026-09-30', dueDate: '2026-10-31', validUntil: '2026-10-31',
      delivery: '', conditions: '', lines: [{ name: '業務最適解PJ', quantity: 1, unitPrice: 70000 }],
    })
    const invoice = templateDocument(input, { ...defaults.issuer, name: 'Acoru合同会社' })
    const blocks = await pdfTextBlocks(await createBusinessDocumentPdf(invoice, input))
    for (const [x, y, size] of [[52, 668, 19], [84, 578, 18], [349, 675, 14]]) {
      const block = blocks.find(value => value.includes(`1 0 0 1 ${x} ${y} Tm`))
      assert.ok(block, `${kind}: text at ${x},${y}`)
      assert.match(block, new RegExp(`/\\S+ ${size} Tf`), `${kind}: exact ${size}pt`)
    }
    for (const name of ['株式会社札幌フードサービス', '株式会社札幌\nフードサービス']) {
      const longBlocks = await pdfTextBlocks(await createBusinessDocumentPdf({
        ...invoice, document: { ...invoice.document, name },
      }, input))
      const recipientBlocks = longBlocks.filter(value => {
        const position = value.match(/1 0 0 1 52 ([\d.]+) Tm/)
        return position && Number(position[1]) > 600 && Number(position[1]) < 690
      })
      assert.equal(recipientBlocks.length, 1, `${kind}: recipient and honorific share one line`)
      assert.match(recipientBlocks[0], /1 0 0 1 52 668 Tm/)
      const fittedSize = Number(recipientBlocks[0].match(/\/\S+ ([\d.]+) Tf/)?.[1])
      assert.ok(fittedSize >= 9 && fittedSize < 19, `${kind}: readable recipient fitted to width`)
    }
    for (const document of [
      { ...invoice.document, name: '長'.repeat(50) },
      { ...invoice.document, subject: '長'.repeat(55) },
    ]) {
      await assert.rejects(createBusinessDocumentPdf({ ...invoice, document }, input), /短く調整/)
    }
  }
})

test('invoice registration uses searchable ASCII glyphs below the phone on every page', async () => {
  const input = templateInputSchema.parse({
    kind: 'invoice', name: 'テスト株式会社', honorific: '御中', subject: '月次保守',
    issueDate: '2026-09-30', dueDate: '2026-10-10',
    lines: Array.from({ length: 20 }, () => ({ name: '月次保守', quantity: 1, unitPrice: 1000 })),
  })
  const invoice = templateDocument(input, { ...defaults.issuer, registration: 'T8430003015878', address: '札幌市', tel: '080-1879-4117' })
  const bytes = await createInvoicePdf(invoice)
  const pdf = await PDFDocument.load(bytes)
  assert.ok(pdf.getPageCount() > 1)
  for (let pageIndex = 0; pageIndex < pdf.getPageCount(); pageIndex++) {
    const blocks = await pdfTextBlocks(bytes, pageIndex)
    const registration = blocks.find(block => block.includes('1 0 0 1 349 625 Tm'))
    assert.ok(registration, 'number is directly below the phone')
    assert.match(registration, /<0035> Tj/, 'prefix uses the searchable ASCII glyph')
    const digits = blocks.find(block => block.includes('1 0 0 1 354.0915 625 Tm'))
    assert.ok(digits, 'digits immediately follow the prefix')
    assert.match(digits, /<0019001500140011001100110014001100120016001900180019> Tj/, 'digits use the searchable ASCII glyphs')
    assert.ok(blocks.some(block => block.includes('1 0 0 1 373 637 Tm')), 'phone stays 12pt above registration')
    const resources = pdf.getPage(pageIndex).node.Resources()!
    const fontName = registration.match(/\/(\S+) 8\.5 Tf/)![1]
    const fontDictionary = resources.lookup(PDFName.of('Font'), PDFDict).lookup(PDFName.of(fontName), PDFDict)
    const cmap = pdf.context.lookup(fontDictionary.get(PDFName.of('ToUnicode'))!)
    assert.ok(cmap instanceof PDFRawStream)
    const mapping = Buffer.from(decodePDFRawStream(cmap).decode()).toString()
    for (const character of new Set('T8430003015878'))
      assert.ok(mapping.includes(`<${character.charCodeAt(0).toString(16).padStart(4, '0')}>`), `searchable ${character}`)
  }
  const quotation = await createBusinessDocumentPdf(invoice, { kind: 'quotation', validUntil: '2026-10-10', delivery: '', conditions: '' })
  assert.ok(!(await pdfTextBlocks(quotation)).some(block => block.includes('1 0 0 1 349 625 Tm')), 'quotation does not gain a registration line')
})

test('Japanese PDF supports more than seven items with page totals', async () => {
  const { db, repo } = await setup()
  try {
    await repo.generate('2026-09', 'test')
    const inv = await repo.invoice('INV-202609-T1')
    assert.equal(documentSubject(inv.document), 'システム保守')
    assert.equal(documentSubject({ ...inv.document, subject: '登録した件名', dealTitle: '案件名' }), '登録した件名')
    assert.equal(documentSubject({ ...inv.document, subject: '　 ', dealTitle: '案件名' }), '案件名')
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
