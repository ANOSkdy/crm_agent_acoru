import { createHash } from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import { createInvoicePdf } from '../../lib/billing/pdf'
import { totals, type Invoice } from '../../lib/billing/domain'
import { resendRequested } from './resend-requested.mjs'

// Explicit one-invoice operation. No invocation from the application or cron.
const [invoiceId, sourceDeliveryId, recipient, requestId, expectedPdfSha256, expectedDocumentSha256, mode] = process.argv.slice(2)
async function main() {
  if (!/^[a-f0-9]{64}$/.test(expectedPdfSha256 ?? '') ||
      !/^[a-f0-9]{64}$/.test(expectedDocumentSha256 ?? ''))
    throw new Error('Reviewed PDF and invoice hashes are required')
  const sql = neon(process.env.DATABASE_URL!)
  const [row] = await sql.query('SELECT * FROM billing.invoices WHERE id=$1', [invoiceId])
  if (!row || row.period !== '2026-09' || row.document.name !== 'ROBINSON株式会社' ||
      row.document.email !== recipient || row.document.issuer.registration !== 'T8430003015878' ||
      row.status !== 'sent' || row.document.provisional || row.document.reviewNote)
    throw new Error('Requested September invoice does not match')
  const invoice = { ...row, subtotal: Number(row.subtotal), tax: Number(row.tax), total: Number(row.total) } as Invoice
  const calculated = totals(invoice.document.lines)
  if (calculated.subtotal !== invoice.subtotal || calculated.tax !== invoice.tax || calculated.total !== invoice.total || invoice.total !== 66000)
    throw new Error('Invoice totals do not match')
  const documentSha256 = createHash('sha256').update(JSON.stringify(invoice.document)).digest('hex')
  if (documentSha256 !== expectedDocumentSha256) throw new Error('Reviewed invoice changed')
  const pdf = await createInvoicePdf(invoice)
  if (createHash('sha256').update(pdf).digest('hex') !== expectedPdfSha256)
    throw new Error('Generated PDF differs from the reviewed attachment')
  const result = await resendRequested({
    db: {
      query: (text: string, params: unknown[]) => sql.query(text, params),
      transaction: (statements: { text: string; params: unknown[] }[]) =>
        sql.transaction(statements.map(({ text, params }) => sql.query(text, params))),
    },
    request: { invoiceId, sourceDeliveryId, recipient, requestId, reason: 'invoice_registration_added', documentSha256 },
    revisedPdf: pdf, execute: mode === '--execute', apiKey: process.env.RESEND_API_KEY,
    live: process.env.VERCEL_ENV === 'production' && process.env.BILLING_LIVE_SEND_ENABLED === 'true' && process.env.BILLING_ALLOW_REAL_RECIPIENTS === 'true',
  })
  console.log('[invoice-registration-resend]', JSON.stringify(result))
  if (!['prepared', 'sent', 'not_sent'].includes(result.status)) process.exitCode = 1
}
main().catch(() => {
  console.error('[invoice-registration-resend] Stopped; inspect the request and audit record before retrying.')
  process.exitCode = 1
})
