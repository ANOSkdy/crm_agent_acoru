import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { resendRequested } from '../scripts/billing/resend-requested.mjs'

const db = new PGlite()
try {
  await db.exec(await readFile('scripts/db/migrations/004_billing.sql', 'utf8'))
  await db.exec('ALTER TABLE billing.customers ADD COLUMN billing_enabled boolean NOT NULL DEFAULT true')
  const deliveryId = randomUUID()
  const archived = Buffer.from('%PDF-1.7 archived invoice').toString('base64')
  await db.query("INSERT INTO billing.customers(id,data) VALUES ('customer',$1::jsonb)", [JSON.stringify({ email: 'billing@example.com' })])
  await db.query(`INSERT INTO billing.invoices(id,customer_id,period,status,document,subtotal,tax,total)
    VALUES ('invoice','customer','2026-09','sent',$1::jsonb,70000,7000,77000)`,
  [JSON.stringify({ issueDate: '2026-09-30', name: 'テスト株式会社', email: 'contact@example.com' })])
  await db.query(`INSERT INTO billing.deliveries(id,invoice_id,revision,mode,status,recipient,payload,pdf_base64,provider_id)
    VALUES ($1,'invoice',1,'live','sent','contact@example.com',$2::jsonb,$3,'original-provider')`,
  [deliveryId, JSON.stringify({ from: 'Acoru <sender@example.com>', to: ['contact@example.com'], subject: 'Original subject', text: 'Original text' }), archived])
  await db.query("UPDATE billing.deliveries SET updated_at='2026-09-27 05:47:33.493465+00'::timestamptz")
  const adapter = {
    query: async (text, params) => (await db.query(text, params)).rows,
    transaction: statements => db.transaction(async tx => {
      const result = []
      for (const { text, params } of statements) result.push((await tx.query(text, params)).rows)
      return result
    }),
  }
  const originalInvoice = (await db.query('SELECT * FROM billing.invoices')).rows
  const originalDelivery = (await db.query('SELECT * FROM billing.deliveries')).rows
  const originalCustomer = (await db.query('SELECT * FROM billing.customers')).rows
  const request = { invoiceId: 'invoice', sourceDeliveryId: deliveryId, recipient: 'billing@example.com', requestId: randomUUID() }
  let sends = 0
  const options = { db: adapter, request, execute: true, live: true, apiKey: 'mock', fetcher: async (_url, init) => {
    sends++
    const payload = JSON.parse(init.body)
    assert.deepEqual(payload.to, ['billing@example.com'])
    assert.equal(payload.text, 'Original text')
    assert.equal(payload.subject, 'Original subject')
    assert.equal(payload.attachments[0].content, archived)
    assert.equal(payload.attachments[0].filename, '20260930_請求書（テスト株式会社）.pdf')
    assert.equal(init.headers['Idempotency-Key'], `billing-manual-resend-${request.requestId}`)
    assert.equal((await db.query("SELECT count(*)::int AS count FROM billing.events WHERE action='manual_resend_started'")).rows[0].count, 1)
    return new Response(JSON.stringify({ id: 'mock-resent' }), { status: 200 })
  } }
  assert.equal((await resendRequested({ ...options, execute: false })).status, 'prepared')
  assert.equal(sends, 0)
  assert.equal((await db.query('SELECT * FROM billing.events')).rows.length, 0)
  await assert.rejects(resendRequested({ ...options, request: { ...request, recipient: 'wrong@example.com' } }), /Recipient/)
  await assert.rejects(resendRequested({ ...options, live: false }), /not enabled/)
  const results = await Promise.all([resendRequested(options), resendRequested(options)])
  assert.deepEqual(results.map(result => result.status).sort(), ['not_sent', 'sent'])
  assert.equal((await resendRequested(options)).status, 'not_sent')
  assert.equal(sends, 1)
  const uncertainOptions = { ...options, request: { ...request, requestId: randomUUID() }, fetcher: async () => {
    sends++
    throw new Error('Network timeout')
  } }
  assert.equal((await resendRequested(uncertainOptions)).status, 'uncertain')
  assert.equal((await resendRequested(uncertainOptions)).status, 'not_sent')
  assert.equal(sends, 2)
  const revisedPdf = Buffer.from('%PDF-1.7 revised invoice with T8430003015878')
  const hash = bytes => createHash('sha256').update(bytes).digest('hex')
  const revisedRequest = { ...request, requestId: randomUUID(), reason: 'invoice_registration_added',
    documentSha256: hash(JSON.stringify(originalInvoice[0].document)) }
  const revisedOptions = { ...options, request: revisedRequest, revisedPdf, fetcher: async (_url, init) => {
    sends++
    const payload = JSON.parse(init.body)
    assert.deepEqual(payload.to, ['billing@example.com'])
    assert.equal(payload.text, 'Original text')
    assert.equal(payload.subject, 'Original subject')
    assert.equal(payload.attachments[0].content, revisedPdf.toString('base64'))
    return new Response(JSON.stringify({ id: 'mock-revised' }), { status: 200 })
  } }
  const beforePreparation = (await db.query('SELECT * FROM billing.events')).rows
  const revisedPreview = await resendRequested({ ...revisedOptions, execute: false })
  assert.equal(revisedPreview.sha256, hash(revisedPdf))
  assert.equal(sends, 2)
  assert.deepEqual((await db.query('SELECT * FROM billing.events')).rows, beforePreparation)
  for (const invalid of [
    { ...revisedRequest, reason: undefined },
    { ...revisedRequest, documentSha256: 'changed' },
  ]) await assert.rejects(resendRequested({ ...revisedOptions, request: invalid }), /explicit reason/)
  await assert.rejects(resendRequested({ ...revisedOptions, revisedPdf: Buffer.from('not a PDF') }), /PDF is invalid/)
  assert.equal((await resendRequested(revisedOptions)).status, 'sent')
  assert.equal((await resendRequested(revisedOptions)).status, 'not_sent')
  assert.equal(sends, 3)
  const revisedAudit = (await db.query("SELECT detail FROM billing.events WHERE action='manual_resend_started' AND detail->>'requestId'=$1", [revisedRequest.requestId])).rows[0].detail
  assert.equal(revisedAudit.reason, 'invoice_registration_added')
  assert.equal(revisedAudit.pdf_base64, revisedPdf.toString('base64'))
  assert.equal(revisedAudit.originalPdfSha256, hash(Buffer.from(archived, 'base64')))
  assert.equal(revisedAudit.payload.attachments[0].sha256, hash(revisedPdf))
  assert.deepEqual((await db.query('SELECT * FROM billing.invoices')).rows, originalInvoice)
  assert.deepEqual((await db.query('SELECT * FROM billing.deliveries')).rows, originalDelivery)
  assert.deepEqual((await db.query('SELECT * FROM billing.customers')).rows, originalCustomer)
  console.log('Passed: revised PDF audit, unchanged invoice guards, immutable originals, recipient validation, duplicate prevention, dry run, live gate and uncertain outcome.')
} finally { await db.close() }
