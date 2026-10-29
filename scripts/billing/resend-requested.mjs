import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { neon } from '@neondatabase/serverless'

// Explicit maintenance operation only. Normal deliveries and cron cannot call
// this path. Original invoices, deliveries and archived PDFs remain immutable.
export async function resendRequested({ db, request, revisedPdf, execute = false, live = false, apiKey, fetcher = fetch }) {
  const { invoiceId, sourceDeliveryId, recipient, requestId } = request
  if (!invoiceId || !/^[0-9a-f-]{36}$/i.test(sourceDeliveryId ?? '') ||
      !/^[0-9a-f-]{36}$/i.test(requestId ?? '') ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient ?? '')) throw new Error('Invalid resend request')
  const [source] = await db.query(`SELECT i.id,i.version,i.document,i.status,c.version AS customer_version,
    c.billing_enabled,c.data->>'email' AS configured_email,d.id AS delivery_id,
    d.payload,d.pdf_base64,d.provider_id,d.updated_at::text AS delivery_updated_at,d.status AS delivery_status
    FROM billing.invoices i JOIN billing.customers c ON c.id=i.customer_id
    JOIN billing.deliveries d ON d.invoice_id=i.id
    WHERE i.id=$1 AND d.id=$2::uuid AND d.mode='live'`, [invoiceId, sourceDeliveryId])
  if (!source || source.status !== 'sent' || source.delivery_status !== 'sent' || !source.provider_id)
    throw new Error('An accepted original delivery is required')
  if (!source.billing_enabled || source.configured_email !== recipient)
    throw new Error('Recipient must match the enabled billing settings')
  if (revisedPdf !== undefined && (
    !Buffer.isBuffer(revisedPdf) || request.reason !== 'invoice_registration_added' ||
    request.documentSha256 !== createHash('sha256').update(JSON.stringify(source.document)).digest('hex')
  )) throw new Error('Revised PDF requires an explicit reason and unchanged invoice snapshot')
  const pdf = revisedPdf ?? Buffer.from(source.pdf_base64, 'base64')
  if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Archived PDF is invalid')
  const pdfBase64 = pdf.toString('base64')
  const sha256 = createHash('sha256').update(pdf).digest('hex')
  const customerName = source.document.name
    .replace(/[<>:"/\\|?*]/g, '_').replace(/\p{Cc}/gu, '_')
    .trim().replace(/[. ]+$/g, '') || '顧客名未登録'
  const filename = `${source.document.issueDate.replaceAll('-', '')}_請求書（${customerName}）.pdf`
  const payload = {
    from: source.payload.from, to: [recipient], subject: source.payload.subject,
    ...(source.payload.text ? { text: source.payload.text } : {}),
    ...(source.payload.html ? { html: source.payload.html } : {}),
    attachments: [{ filename, content: pdfBase64 }],
  }
  if (!payload.from || !payload.subject || (!payload.text && !payload.html))
    throw new Error('Original email content is incomplete')
  const detail = {
    requestId, sourceDeliveryId, recipient, authorization: 'explicit_user_request',
    reason: revisedPdf ? request.reason : 'correct_recipient', invoiceVersion: source.version,
    ...(revisedPdf ? { pdf_base64: pdfBase64, documentSha256: request.documentSha256,
      originalPdfSha256: createHash('sha256').update(Buffer.from(source.pdf_base64, 'base64')).digest('hex') } : {}),
    payload: { ...payload, attachments: [{ filename, sha256 }] },
  }
  if (!execute) return { status: 'prepared', invoiceId, recipient, filename, bytes: pdf.length, sha256, requestId }
  if (!live || !apiKey) throw new Error('Production sending is not enabled')
  // The second statement receives a fresh snapshot after the invoice row lock.
  // A persistent audit claim prevents retrying even after provider dedup expires.
  const [, claimed] = await db.transaction([
    { text: 'SELECT id FROM billing.invoices WHERE id=$1 FOR UPDATE', params: [invoiceId] },
    { text: `INSERT INTO billing.events(actor,action,target,detail)
      SELECT 'codex:user-requested-resend','manual_resend_started',i.id,$5::jsonb
      FROM billing.invoices i JOIN billing.customers c ON c.id=i.customer_id
      JOIN billing.deliveries d ON d.invoice_id=i.id
      WHERE i.id=$1 AND i.status='sent' AND i.version=$6 AND c.billing_enabled=true
        AND c.version=$7 AND c.data->>'email'=$3 AND d.id=$2::uuid
        AND d.mode='live' AND d.status='sent' AND d.updated_at=$8::timestamptz
        AND NOT EXISTS(SELECT 1 FROM billing.events WHERE detail->>'requestId'=$4)
      RETURNING id`, params: [invoiceId, sourceDeliveryId, recipient, requestId, JSON.stringify(detail),
        source.version, source.customer_version, source.delivery_updated_at] },
  ])
  if (!claimed.length) return { status: 'not_sent', reason: 'Already claimed or source changed', requestId }
  let providerId = null
  try {
    const response = await fetcher('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
        'Idempotency-Key': `billing-manual-resend-${requestId}` },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(20000),
    })
    const result = await response.json()
    if (!response.ok || typeof result.id !== 'string' || !result.id) throw new Error('Provider outcome uncertain')
    providerId = result.id
    await db.query(`INSERT INTO billing.events(actor,action,target,detail)
      VALUES ('codex:user-requested-resend','manual_resend_sent',$1,$2::jsonb)`,
    [invoiceId, JSON.stringify({ requestId, sourceDeliveryId, recipient, providerId, filename, sha256 })])
    return { status: 'sent', invoiceId, recipient, filename, requestId, providerId, sha256 }
  } catch {
    try {
      await db.query(`INSERT INTO billing.events(actor,action,target,detail)
        VALUES ('codex:user-requested-resend','manual_resend_uncertain',$1,$2::jsonb)`,
      [invoiceId, JSON.stringify({ requestId, sourceDeliveryId, recipient, providerId })])
    } catch { /* The durable started event continues to prevent duplicate sends. */ }
    return { status: providerId ? 'accepted_audit_pending' : 'uncertain', invoiceId, recipient, requestId, providerId }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [invoiceId, sourceDeliveryId, recipient, requestId, mode] = process.argv.slice(2)
    const sql = neon(process.env.DATABASE_URL)
    const db = {
      query: (text, params) => sql.query(text, params),
      transaction: (statements) => sql.transaction(statements.map(({ text, params }) => sql.query(text, params))),
    }
    const result = await resendRequested({ db, request: { invoiceId, sourceDeliveryId, recipient, requestId },
      execute: mode === '--execute', apiKey: process.env.RESEND_API_KEY,
      live: process.env.VERCEL_ENV === 'production' && process.env.BILLING_LIVE_SEND_ENABLED === 'true'
        && process.env.BILLING_ALLOW_REAL_RECIPIENTS === 'true',
    })
    console.log('[requested-invoice-resend]', JSON.stringify(result))
    if (!['prepared', 'sent', 'not_sent'].includes(result.status)) process.exitCode = 1
  } catch {
    console.error('[requested-invoice-resend] Stopped; inspect the request and audit record before retrying.')
    process.exitCode = 1
  }
}
