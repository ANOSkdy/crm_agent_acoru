import { readFile } from 'node:fs/promises'
import { neon } from '@neondatabase/serverless'
import { config } from 'dotenv'
import {
  customerSchema,
  defaults,
  issuerSchema,
  isDummy,
  totals,
  type Invoice,
} from '../../lib/billing/domain'

config({ path: '.env.local', quiet: true })
async function main() {
  const source = process.argv.find((a) => a.endsWith('.json'))
  if (!source)
    throw new Error(
      'Usage: pnpm exec tsx scripts/billing/import.ts sanitized.json [--apply]',
    )
  const data = JSON.parse(await readFile(source, 'utf8')) as {
    customers: unknown[]
    invoices: Invoice[]
    issuer: unknown
  }
  const issuer = issuerSchema.parse(data.issuer)
  if (issuer.bank === '未設定' || issuer.registration === 'T0000000000000')
    throw new Error('Private issuer configuration required')
  const customers = data.customers.map((c) => customerSchema.parse(c))
  if (
    customers.some((c) => !isDummy(c.email)) ||
    data.invoices.some((i) => !isDummy(i.document.email))
  )
    throw new Error('Import accepts dummy recipients only')
  const invoices = data.invoices.map((i) => ({
    ...i,
    document: { ...i.document, issuer },
    ...totals(i.document.lines),
  }))
  console.log({
    customers: customers.length,
    invoices: invoices.length,
    apply: process.argv.includes('--apply'),
    recipients: 'dummy only',
  })
  if (process.argv.includes('--apply')) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing')
    const sql = neon(process.env.DATABASE_URL)
    const results = await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(4278160)`,
      sql`INSERT INTO billing.settings(id,value) VALUES (true,${JSON.stringify({ ...defaults, issuer, automation: true })}::jsonb) ON CONFLICT DO NOTHING`,
      sql`INSERT INTO billing.customers(id,data) SELECT c->>'id',c FROM jsonb_array_elements(${JSON.stringify(customers)}::jsonb) c ON CONFLICT DO NOTHING RETURNING id`,
      sql`INSERT INTO billing.invoices(id,customer_id,period,status,document,subtotal,tax,total)
      SELECT x.id,x.customer_id,x.period,x.status,x.document,x.subtotal,x.tax,x.total FROM jsonb_to_recordset(${JSON.stringify(invoices)}::jsonb)
      AS x(id text,customer_id text,period text,status text,document jsonb,subtotal bigint,tax bigint,total bigint)
      ON CONFLICT DO NOTHING RETURNING id`,
      sql`INSERT INTO billing.events(actor,action,target,detail) VALUES ('migration','legacy_import','xlsx',${JSON.stringify({ customers: customers.length, invoices: invoices.length, recipients: 'dummy only' })}::jsonb)`,
    ])
    console.log({
      insertedCustomers: results[2].length,
      insertedInvoices: results[3].length,
    })
  }
}
main().catch(() => {
  console.error('移行に失敗しました。接続設定と検証用データを確認してください')
  process.exitCode = 1
})
