import { randomUUID } from 'node:crypto'
import {
  assertRecipient,
  customerSchema,
  defaults,
  invoiceDates,
  settingsSchema,
  totals,
  validatePeriod,
  type Customer,
  type Invoice,
  type Settings,
} from './domain'

export interface Database {
  query(text: string, params?: unknown[]): Promise<Record<string, unknown>[]>
}
export class BillingRepository {
  constructor(readonly db: Database) {}
  async settings(): Promise<{ value: Settings; version: number }> {
    const rows = await this.db.query(
      'SELECT value, version FROM billing.settings WHERE id = true',
    )
    return rows.length
      ? (rows[0] as { value: Settings; version: number })
      : { value: defaults, version: 0 }
  }
  async customers(): Promise<Customer[]> {
    const rows = await this.db.query(
      'SELECT data, version FROM billing.customers ORDER BY id',
    )
    return rows.map((r) => ({
      ...(r.data as Customer),
      version: Number(r.version),
    }))
  }
  async invoices(period?: string): Promise<Invoice[]> {
    const rows = await this.db.query(
      'SELECT * FROM billing.invoices WHERE ($1::text IS NULL OR period = $1) ORDER BY period DESC, id',
      [period ? validatePeriod(period) : null],
    )
    return rows.map((r) => ({
      ...r,
      subtotal: Number(r.subtotal),
      tax: Number(r.tax),
      total: Number(r.total),
    })) as Invoice[]
  }
  async invoice(id: string): Promise<Invoice> {
    const rows = await this.db.query(
      'SELECT * FROM billing.invoices WHERE id = $1',
      [id],
    )
    if (!rows[0]) throw new Error('請求書が見つかりません')
    const r = rows[0]
    return {
      ...r,
      subtotal: Number(r.subtotal),
      tax: Number(r.tax),
      total: Number(r.total),
    } as Invoice
  }
  async events() {
    return this.db.query(
      'SELECT * FROM billing.events ORDER BY id DESC LIMIT 100',
    )
  }
  async deliveries(id?: string) {
    return this.db.query(
      'SELECT id, invoice_id, revision, mode, status, recipient, provider_id, created_at, updated_at FROM billing.deliveries WHERE ($1::text IS NULL OR invoice_id = $1) ORDER BY created_at DESC LIMIT 100',
      [id ?? null],
    )
  }
  async event(
    actor: string,
    action: string,
    target: string | null,
    detail: object = {},
  ) {
    await this.db.query(
      'INSERT INTO billing.events(actor,action,target,detail) VALUES ($1,$2,$3,$4::jsonb)',
      [actor, action, target, JSON.stringify(detail)],
    )
  }
  async saveCustomer(
    input: unknown,
    version: number,
    actor: string,
    allowReal = false,
  ) {
    const data = customerSchema.parse(input)
    assertRecipient(data.email, allowReal)
    totals(data.lines)
    const rows = await this.db.query(
      `WITH changed AS (
      INSERT INTO billing.customers(id,data) SELECT $1,$2::jsonb WHERE $3 = 0
      ON CONFLICT DO NOTHING RETURNING id
    ), updated AS (
      UPDATE billing.customers SET data=$2::jsonb,version=version+1,updated_at=now() WHERE id=$1 AND version=$3 AND $3>0 RETURNING id
    ), logged AS (INSERT INTO billing.events(actor,action,target) SELECT $4,'customer_saved',id FROM (SELECT id FROM changed UNION ALL SELECT id FROM updated) x RETURNING id)
    SELECT id FROM logged`,
      [data.id, JSON.stringify(data), version, actor],
    )
    if (!rows.length)
      throw new Error(
        '他の操作で更新されています。画面を再読み込みしてください',
      )
  }
  async saveSettings(input: unknown, version: number, actor: string) {
    const data = settingsSchema.parse(input)
    const rows = await this.db.query(
      `WITH changed AS (
      INSERT INTO billing.settings(id,value,version) SELECT true,$1::jsonb,1 WHERE $2=0 ON CONFLICT DO NOTHING RETURNING id
    ), updated AS (UPDATE billing.settings SET value=$1::jsonb,version=version+1,updated_at=now() WHERE id=true AND version=$2 AND $2>0 RETURNING id),
    logged AS (INSERT INTO billing.events(actor,action,target) SELECT $3,'settings_saved','settings' FROM (SELECT id FROM changed UNION ALL SELECT id FROM updated) x RETURNING id) SELECT id FROM logged`,
      [JSON.stringify(data), version, actor],
    )
    if (!rows.length)
      throw new Error('設定が更新されています。画面を再読み込みしてください')
  }
  async generate(period: string, actor: string) {
    validatePeriod(period)
    const [customers, settings] = await Promise.all([
      this.customers(),
      this.settings(),
    ])
    const invoices = customers
      .filter((c) => c.status === '契約中')
      .map((c) => ({
        id: `INV-${period.replace('-', '')}-${c.id}`,
        customer_id: c.id,
        period,
        document: {
          name: c.name,
          email: c.email,
          honorific: c.honorific,
          ...invoiceDates(period, c.paymentTerm),
          lines: c.lines,
          issuer: settings.value.issuer,
        },
        ...totals(c.lines),
      }))
    const rows = await this.db.query(
      `WITH inserted AS (
      INSERT INTO billing.invoices(id,customer_id,period,document,subtotal,tax,total)
      SELECT x.id,x.customer_id,x.period,x.document,x.subtotal,x.tax,x.total
      FROM jsonb_to_recordset($1::jsonb) AS x(id text,customer_id text,period text,document jsonb,subtotal bigint,tax bigint,total bigint)
      ON CONFLICT DO NOTHING RETURNING id
    ), logged AS (INSERT INTO billing.events(actor,action,target,detail) SELECT $2,'invoice_created',id,jsonb_build_object('period',$3::text) FROM inserted RETURNING id)
    SELECT id FROM logged`,
      [JSON.stringify(invoices), actor, period],
    )
    return { created: rows.length, skipped: invoices.length - rows.length }
  }
  async updateInvoice(
    id: string,
    version: number,
    document: Invoice['document'],
    status: 'draft' | 'held',
    actor: string,
    allowReal = false,
  ) {
    assertRecipient(document.email, allowReal)
    const amount = totals(document.lines)
    const rows = await this.db.query(
      `WITH updated AS (
      UPDATE billing.invoices SET document=$3::jsonb,status=$4,subtotal=$5,tax=$6,total=$7,version=version+1,updated_at=now()
      WHERE id=$1 AND version=$2 AND status IN ('draft','simulated','held')
      AND NOT EXISTS(SELECT 1 FROM billing.deliveries WHERE invoice_id=$1 AND mode='live') RETURNING id
    ) INSERT INTO billing.events(actor,action,target) SELECT $8,'invoice_updated',id FROM updated RETURNING id`,
      [
        id,
        version,
        JSON.stringify(document),
        status,
        amount.subtotal,
        amount.tax,
        amount.total,
        actor,
      ],
    )
    if (!rows.length)
      throw new Error(
        '更新できません。送信状態または更新競合を確認してください',
      )
  }
  async claim(
    invoice: Invoice,
    mode: 'test' | 'live',
    payload: object,
    pdf: string,
    actor: string,
  ) {
    const id = randomUUID()
    const rows = await this.db.query(
      `WITH locked AS (
      SELECT id FROM billing.invoices WHERE id=$1 AND version=$2 AND status IN ('draft','simulated') FOR UPDATE
    ), inserted AS (
      INSERT INTO billing.deliveries(id,invoice_id,revision,mode,status,recipient,payload,pdf_base64)
      SELECT $3::uuid,id,$2,$4,$5,$6,$7::jsonb,$8 FROM locked ON CONFLICT DO NOTHING RETURNING id
    ), updated AS (
      UPDATE billing.invoices SET status=$9,updated_at=now() WHERE id=$1 AND EXISTS(SELECT 1 FROM inserted) RETURNING id
    ), logged AS (
      INSERT INTO billing.events(actor,action,target,detail) SELECT $10,$11,id,jsonb_build_object('deliveryId',$3::text) FROM updated RETURNING id
    ) SELECT id FROM inserted`,
      [
        invoice.id,
        invoice.version,
        id,
        mode,
        mode === 'live' ? 'sending' : 'simulated',
        invoice.document.email,
        JSON.stringify(payload),
        pdf,
        mode === 'live' ? 'sending' : 'simulated',
        actor,
        mode === 'live' ? 'send_started' : 'send_simulated',
      ],
    )
    return rows.length ? id : null
  }
  async finish(
    id: string,
    status: 'sent' | 'uncertain',
    providerId: string | null,
    actor: string,
  ) {
    await this.db.query(
      `WITH changed AS (
      UPDATE billing.deliveries SET status=$2,provider_id=$3,updated_at=now() WHERE id=$1::uuid AND mode='live' AND status='sending' RETURNING invoice_id
    ), updated AS (UPDATE billing.invoices SET status=$2,updated_at=now() WHERE id IN (SELECT invoice_id FROM changed) RETURNING id)
    INSERT INTO billing.events(actor,action,target,detail) SELECT $4,$2,id,jsonb_build_object('deliveryId',$1::text,'providerId',$3::text) FROM updated`,
      [id, status, providerId, actor],
    )
  }
  async archivedPdf(id: string): Promise<string | null> {
    const rows = await this.db.query(
      `SELECT pdf_base64 FROM billing.deliveries WHERE invoice_id=$1 AND mode='live' ORDER BY created_at LIMIT 1`,
      [id],
    )
    return (rows[0]?.pdf_base64 as string) ?? null
  }
}
