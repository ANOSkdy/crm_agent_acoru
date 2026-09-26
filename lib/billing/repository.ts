import { randomUUID } from 'node:crypto'
import {
  assertRecipient,
  customerSchema,
  defaults,
  invoiceDates,
  settingsSchema,
  totals,
  validatePeriod,
  japanClock,
  type Customer,
  type Invoice,
  type Settings,
  type CrmChoice,
} from './domain'

export interface Database {
  query(text: string, params?: unknown[]): Promise<Record<string, unknown>[]>
}
export class BillingRepository {
  constructor(
    readonly db: Database,
    readonly allowRealRecipients = false,
  ) {}
  async settings(): Promise<{ value: Settings; version: number }> {
    const rows = await this.db.query(
      'SELECT value, version FROM billing.settings WHERE id = true',
    )
    return rows.length
      ? (rows[0] as { value: Settings; version: number })
      : { value: defaults, version: 0 }
  }
  async customers(): Promise<Customer[]> {
    const [rows, companies, choices] = await Promise.all([
      this.db.query('SELECT * FROM billing.customers ORDER BY id'),
      this.db.query(
        "SELECT id,name,address,postal_code FROM companies WHERE deleted_at IS NULL AND status='active' ORDER BY name",
      ),
      this.crmChoices(),
    ])
    const mapped: Customer[] = rows
      .filter((r) => !r.company_id)
      .map((r) => ({
        ...(r.data as Customer),
        version: Number(r.version),
        companyId: null,
        billingEnabled: r.billing_enabled as boolean,
        templateConfirmed: r.template_confirmed as boolean,
      }))
    for (const company of companies) {
      const row = rows.find((r) => r.company_id === company.id)
      const choice = choices.find((c) => c.id === company.id)!
      const deal = choice?.deals.length === 1 ? choice.deals[0] : null
      const data = row?.data as Customer | undefined
      mapped.push({
        ...(data ?? {
          id: `C${company.id}`,
          name: String(company.name),
          email: `customer-${company.id}@example.invalid`,
          honorific: '御中',
          status: '契約前',
          paymentTerm: '翌月末日',
          lines: deal
            ? [
                {
                  name: deal.title,
                  quantity: 1,
                  unitPrice: deal.amount,
                  unit: '式',
                },
              ]
            : [
                {
                  name: '請求内容を入力してください',
                  quantity: 1,
                  unitPrice: 0,
                  unit: '式',
                },
              ],
        }),
        name: String(company.name),
        companyId: String(company.id),
        version: Number(row?.version ?? 0),
        billingEnabled: Boolean(row?.billing_enabled ?? false),
        templateConfirmed: Boolean(row?.template_confirmed ?? false),
        contactId:
          (row?.contact_id as string | null) ??
          (choice?.contacts.length === 1 ? choice.contacts[0].id : null),
        sourceDealId:
          (row?.source_deal_id as string | null) ?? deal?.id ?? null,
        subject: data?.subject ?? deal?.title ?? '月次ご請求',
        address: String(company.address ?? ''),
        postalCode: String(company.postal_code ?? ''),
      } as Customer)
    }
    return mapped
  }
  async crmChoices(): Promise<CrmChoice[]> {
    const [companies, contacts, deals] = await Promise.all([
      this.db.query(
        "SELECT id,name FROM companies WHERE deleted_at IS NULL AND status='active' ORDER BY name",
      ),
      this.db.query(
        "SELECT id,company_id,name,(email IS NOT NULL AND email<>'') AS has_email FROM contacts WHERE deleted_at IS NULL ORDER BY name",
      ),
      this.db.query(
        'SELECT id,company_id,title,amount FROM deals WHERE deleted_at IS NULL ORDER BY created_at DESC',
      ),
    ])
    return companies.map((c) => ({
      id: String(c.id),
      name: String(c.name),
      contacts: contacts
        .filter((t) => t.company_id === c.id)
        .map((t) => ({
          id: String(t.id),
          name: String(t.name),
          hasEmail: Boolean(t.has_email),
        })),
      deals: deals
        .filter((d) => d.company_id === c.id)
        .map((d) => ({
          id: String(d.id),
          title: String(d.title),
          amount: Number(d.amount),
        })),
    }))
  }
  async invoices(period?: string): Promise<Invoice[]> {
    const rows = await this.db.query(
      `SELECT i.*, COALESCE(b.billing_enabled,false) AS billing_enabled FROM billing.invoices i LEFT JOIN billing.customers b ON b.id=i.customer_id WHERE ($1::text IS NULL OR period = $1) ORDER BY period DESC, i.id`,
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
      'SELECT i.*, COALESCE(b.billing_enabled,false) AS billing_enabled FROM billing.invoices i LEFT JOIN billing.customers b ON b.id=i.customer_id WHERE i.id = $1',
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
    if (data.companyId)
      return this.saveCrmCustomer(data, version, actor, allowReal)
    const linked = await this.db.query(
      'SELECT company_id FROM billing.customers WHERE id=$1',
      [data.id],
    )
    if (linked[0]?.company_id)
      throw new Error('CRM顧客の請求設定から更新してください')
    assertRecipient(data.email, allowReal)
    totals(data.lines)
    const rows = await this.db.query(
      `WITH changed AS (
      INSERT INTO billing.customers(id,data,billing_enabled,template_confirmed) SELECT $1,$2::jsonb,$5,$6 WHERE $3 = 0
      ON CONFLICT DO NOTHING RETURNING id
    ), updated AS (
      UPDATE billing.customers SET data=$2::jsonb,billing_enabled=$5,template_confirmed=$6,version=version+1,updated_at=now() WHERE id=$1 AND version=$3 AND $3>0 RETURNING id
    ), logged AS (INSERT INTO billing.events(actor,action,target) SELECT $4,'customer_saved',id FROM (SELECT id FROM changed UNION ALL SELECT id FROM updated) x RETURNING id)
    SELECT id FROM logged`,
      [
        data.id,
        JSON.stringify(data),
        version,
        actor,
        data.billingEnabled ?? data.status === '契約中',
        data.templateConfirmed ?? true,
      ],
    )
    if (!rows.length)
      throw new Error(
        '他の操作で更新されています。画面を再読み込みしてください',
      )
  }
  async saveCrmCustomer(
    data: Customer | ReturnType<typeof customerSchema.parse>,
    version: number,
    actor: string,
    allowReal = false,
  ) {
    const [customers, settings, choices] = await Promise.all([
      this.customers(),
      this.settings(),
      this.crmChoices(),
    ])
    const current = customers.find((c) => c.companyId === data.companyId)
    const choice = choices.find((c) => c.id === data.companyId)
    if (
      !current ||
      !choice ||
      current.id !== data.id ||
      current.version !== version
    )
      throw new Error('顧客が更新されています。画面を再読み込みしてください')
    if (data.contactId && !choice.contacts.some((c) => c.id === data.contactId))
      throw new Error('請求担当者がこの顧客に所属していません')
    if (
      data.sourceDealId &&
      !choice.deals.some((d) => d.id === data.sourceDealId)
    )
      throw new Error('案件がこの顧客に所属していません')
    assertRecipient(data.email, allowReal)
    const saved = {
      ...data,
      name: current.name,
      address: current.address,
      postalCode: current.postalCode,
    }
    const amount = totals(saved.lines)
    if (saved.templateConfirmed && amount.total <= 0)
      throw new Error('月次請求を確定するには金額を設定してください')
    const period = japanClock().period
    const document = await this.document(saved, period, settings.value)
    const invoiceId = `INV-${period.replace('-', '')}-${current.id}`
    const rows = await this.db.query(
      `WITH changed AS (
      INSERT INTO billing.customers(id,data,company_id,billing_enabled,contact_id,source_deal_id,template_confirmed)
      SELECT $1,$2::jsonb,$3::uuid,$4,$5::uuid,$6::uuid,$7 WHERE $8=0
      ON CONFLICT DO NOTHING RETURNING id
    ), updated AS (
      UPDATE billing.customers SET data=$2::jsonb,billing_enabled=$4,contact_id=$5::uuid,source_deal_id=$6::uuid,template_confirmed=$7,version=version+1,updated_at=now()
      WHERE id=$1 AND company_id=$3::uuid AND version=$8 AND $8>0 RETURNING id
    ), saved AS (SELECT id FROM changed UNION ALL SELECT id FROM updated), created AS (
      INSERT INTO billing.invoices(id,customer_id,company_id,period,document,status,subtotal,tax,total)
      SELECT $9,id,$3::uuid,$10,$11::jsonb,'held',$12,$13,$14 FROM saved WHERE $4=true
      ON CONFLICT DO NOTHING RETURNING id
    ), logged AS (
      INSERT INTO billing.events(actor,action,target,detail) SELECT $15,'crm_billing_saved',id,jsonb_build_object('companyId',$3::text,'enabled',$4::boolean,'created',(SELECT count(*) FROM created)) FROM saved RETURNING id
    ) SELECT (SELECT count(*) FROM created)::int AS created FROM logged`,
      [
        current.id,
        JSON.stringify(saved),
        data.companyId,
        Boolean(data.billingEnabled),
        data.contactId ?? null,
        data.sourceDealId ?? null,
        Boolean(data.templateConfirmed),
        version,
        invoiceId,
        period,
        JSON.stringify({ ...document, provisional: true }),
        amount.subtotal,
        amount.tax,
        amount.total,
        actor,
      ],
    )
    if (!rows.length)
      throw new Error(
        '他の操作で更新されています。画面を再読み込みしてください',
      )
    return {
      message: Number(rows[0].created)
        ? '請求を有効にし、今月の請求書を仮作成しました。内容を確認してください。'
        : '請求設定を保存しました。作成済みの請求書は保持されています。',
    }
  }
  async document(
    customer: Customer | ReturnType<typeof customerSchema.parse>,
    period: string,
    settings: Settings,
  ): Promise<Invoice['document']> {
    let email = customer.email
    if (this.allowRealRecipients && customer.companyId && customer.contactId) {
      const [contact] = await this.db.query(
        'SELECT email FROM contacts WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL',
        [customer.contactId, customer.companyId],
      )
      if (!contact?.email)
        throw new Error('請求担当者のメールアドレスを設定してください')
      email = String(contact.email)
    }
    assertRecipient(email, this.allowRealRecipients)
    const enriched = customer as Customer
    return {
      name: customer.name,
      email,
      honorific: customer.honorific,
      ...invoiceDates(period, customer.paymentTerm),
      lines: customer.lines,
      issuer: settings.issuer,
      subject: customer.subject ?? '月次ご請求',
      address: enriched.address ?? '',
      postalCode: enriched.postalCode ?? '',
      provisional: customer.templateConfirmed === false,
    }
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
    const invoices = await Promise.all(
      customers
        .filter(
          (c) =>
            c.billingEnabled !== false &&
            (c.companyId || c.status === '契約中'),
        )
        .map(async (c) => ({
          id: `INV-${period.replace('-', '')}-${c.id}`,
          customer_id: c.id,
          company_id: c.companyId ?? null,
          customer_version: c.version,
          status: c.templateConfirmed === false ? 'held' : 'draft',
          period,
          document: await this.document(c, period, settings.value),
          ...totals(c.lines),
        })),
    )
    const rows = await this.db.query(
      `WITH inserted AS (
      INSERT INTO billing.invoices(id,customer_id,company_id,period,document,status,subtotal,tax,total)
      SELECT x.id,x.customer_id,x.company_id,x.period,x.document,x.status,x.subtotal,x.tax,x.total
      FROM jsonb_to_recordset($1::jsonb) AS x(id text,customer_id text,company_id uuid,customer_version int,period text,document jsonb,status text,subtotal bigint,tax bigint,total bigint)
      JOIN billing.customers b ON b.id=x.customer_id AND b.version=x.customer_version AND b.billing_enabled=true
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
    if (document.provisional && status === 'draft') {
      if (amount.total <= 0)
        throw new Error('送信待ちにするには金額を設定してください')
      document = { ...document, provisional: false }
    }
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
      SELECT i.id FROM billing.invoices i JOIN billing.customers c ON c.id=i.customer_id
      WHERE i.id=$1 AND i.version=$2 AND i.status IN ('draft','simulated') AND c.billing_enabled=true
        AND (c.company_id IS NULL OR EXISTS(SELECT 1 FROM companies WHERE id=c.company_id AND deleted_at IS NULL AND status='active'))
      FOR UPDATE OF i,c
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
