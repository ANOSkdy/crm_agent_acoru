import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import { addressSchema, draftSchema, MailError, reviewRecipients, type Campaign, type CustomerChoice, type Delivery, type DraftInput, type ReviewRecipient } from './domain'

export interface QueryDb { query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]> }
export interface MailDb extends QueryDb { transaction<T>(fn: (db: QueryDb) => Promise<T>): Promise<T> }
export type Actor = { id: string; name: string; email: string }
type Row = Record<string, unknown>
const iso = (value: unknown) => value instanceof Date ? value.toISOString() : String(value)

export class MailRepository {
  constructor(readonly db: MailDb, readonly crm: QueryDb, readonly options: { deliveryMode: 'simulation' | 'live'; from?: string } = { deliveryMode: 'simulation' }) {}

  private recipients(input: DraftInput, choices: CustomerChoice[]) {
    const recipients = reviewRecipients(input, choices)
    if (this.options.deliveryMode !== 'live') return recipients
    const from = z.email().max(254).safeParse(this.options.from)
    if (!from.success) throw new MailError('業務連絡メールの送信元が未設定です')
    return recipients.map(r => ({ ...r, from: `Acoru合同会社 <${from.data}>` }))
  }

  async choices(): Promise<CustomerChoice[]> {
    const [companies, addresses, stops] = await Promise.all([
      this.crm.query(`SELECT co.id,co.name AS company_name,co.industry,
        (co.status='active' AND EXISTS (SELECT 1 FROM deals d LEFT JOIN deal_stages s ON s.id=d.stage_id
          WHERE d.company_id=co.id AND d.deleted_at IS NULL AND (d.status='won' OR (d.status='open' AND s.is_won=true)))) AS eligible
        FROM companies co WHERE co.deleted_at IS NULL ORDER BY co.name,co.id`),
      this.db.query('SELECT company_id,email,version FROM mail_customer_addresses'),
      this.db.query('SELECT email_key FROM mail_stops'),
    ])
    const stopped = new Set(stops.map(s => s.email_key))
    const lookup = new Map(addresses.map(a => [String(a.company_id), a]))
    return companies.map(c => {
      const address = lookup.get(String(c.id))
      const email = String(address?.email ?? '').trim()
      return { id: String(c.id), companyName: String(c.company_name), email: email || null, addressVersion: Number(address?.version ?? 0), industry: c.industry as string | null, eligible: c.eligible === true, stopped: stopped.has(email.toLowerCase()) }
    })
  }

  async address(companyId: string) {
    const [row] = await this.db.query('SELECT email,version FROM mail_customer_addresses WHERE company_id=$1', [z.uuid().parse(companyId)])
    return { email: String(row?.email ?? ''), version: Number(row?.version ?? 0) }
  }

  async saveAddress(raw: z.infer<typeof addressSchema>, actor: Actor) {
    const input = addressSchema.parse(raw)
    const [company] = await this.crm.query('SELECT id FROM companies WHERE id=$1 AND deleted_at IS NULL', [input.companyId])
    if (!company) throw new MailError('顧客が見つかりません', 404)
    return this.db.transaction(async db => {
      const rows = input.version === 0
        ? await db.query('INSERT INTO mail_customer_addresses(company_id,email,actor_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING version', [input.companyId, input.email, actor.id])
        : await db.query('UPDATE mail_customer_addresses SET email=$2,version=version+1,actor_id=$3,updated_at=now() WHERE company_id=$1 AND version=$4 RETURNING version', [input.companyId, input.email, actor.id, input.version])
      if (!rows.length) throw new MailError('代表メールが別の操作で更新されました。再読み込みしてください', 409)
      await this.event(db, null, actor, 'customer_address_saved', { companyId: input.companyId, email: input.email })
      return { email: input.email, version: Number(rows[0].version) }
    })
  }

  private assertCompanyMode(campaign: Campaign) {
    if (campaign.recipientMode !== 'company') throw new MailError('担当者宛ての旧方式は再実行できません。顧客を選択して新規作成してください', 409)
  }

  async campaign(id: string, db: QueryDb = this.db): Promise<Campaign> {
    const [row] = await db.query('SELECT * FROM mail_campaigns WHERE id=$1', [z.uuid().parse(id)])
    if (!row) throw new MailError('下書きが見つかりません', 404)
    const deliveries = await db.query('SELECT * FROM mail_deliveries WHERE campaign_id=$1 ORDER BY snapshot->>\'companyName\',snapshot->>\'name\',id', [id])
    return this.toCampaign(row, deliveries)
  }

  private toCampaign(row: Row, deliveries: Row[] = []): Campaign {
    const recipientMode = row.recipient_mode as Campaign['recipientMode']
    const companyIds = row.company_ids as string[]
    return { id: String(row.id), version: Number(row.version), subject: String(row.subject), body: String(row.body), companyIds, recipientMode, selectedCount: recipientMode === 'company' ? companyIds.length : (row.contact_ids as string[]).length, status: row.status as Campaign['status'], deliveryMode: row.delivery_mode === 'live' ? 'live' : 'simulation', processingUntil: row.lease_until != null && new Date(iso(row.lease_until)).getTime() > Date.now() ? iso(row.lease_until) : null, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), actorName: String(row.actor_name), testedVersion: row.tested_version == null ? null : Number(row.tested_version), review: row.review as ReviewRecipient[] | null, deliveries: deliveries.map(r => ({ ...(r.snapshot as ReviewRecipient), id: String(r.id), status: r.status as Delivery['status'], attempts: Number(r.attempts), result: r.result as string | null })) }
  }

  async list(companyId?: string): Promise<Campaign[]> {
    const rows = await this.db.query(`SELECT c.* FROM mail_campaigns c WHERE ($1::text IS NULL OR
      EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(c.review,'[]'::jsonb)) r WHERE r->>'companyId'=$1)) ORDER BY c.updated_at DESC LIMIT 100`, [companyId ?? null])
    return rows.map(r => this.toCampaign(r))
  }

  private async event(db: QueryDb, id: string | null, actor: Actor, action: string, detail: unknown = {}) {
    await db.query('INSERT INTO mail_events(id,campaign_id,actor_id,action,detail) VALUES($1,$2,$3,$4,$5::jsonb)', [randomUUID(), id, actor.id, action, JSON.stringify({ actorName: actor.name, ...detail as object })])
  }

  async save(raw: DraftInput, actor: Actor, id?: string, version?: number) {
    const input = draftSchema.parse(raw)
    input.companyIds = [...new Set(input.companyIds)]
    // Resolve on the server even when the client sends forged IDs.
    const choices = await this.choices()
    if (input.companyIds.some(id => !choices.some(c => c.id === id))) throw new MailError('削除済みの顧客が含まれています。対象を選び直してください')
    return this.db.transaction(async db => {
      const campaignId = id ?? randomUUID()
      if (id) {
        const rows = await db.query(`UPDATE mail_campaigns SET subject=$3,body=$4,company_ids=$5::jsonb,
          version=version+1,status='draft',tested_version=NULL,review=NULL,updated_at=now(),actor_id=$6,actor_name=$7
          WHERE id=$1 AND version=$2 AND recipient_mode='company' AND status IN ('draft','reviewed') RETURNING id`, [id, version, input.subject, input.body, JSON.stringify(input.companyIds), actor.id, actor.name])
        if (!rows.length) throw new MailError('別の操作で更新されたか、送信開始済みです。再読み込みしてください', 409)
      } else {
        await db.query("INSERT INTO mail_campaigns(id,subject,body,company_ids,recipient_mode,actor_id,actor_name) VALUES($1,$2,$3,$4::jsonb,'company',$5,$6)", [campaignId, input.subject, input.body, JSON.stringify(input.companyIds), actor.id, actor.name])
      }
      await this.event(db, campaignId, actor, 'draft_saved')
      return this.campaign(campaignId, db)
    })
  }

  async test(id: string, version: number, actor: Actor) {
    const before = await this.campaign(id)
    this.assertCompanyMode(before)
    const review = this.recipients(before, await this.choices())
    const sample = review.find(r => !r.exclusion)
    if (!sample) throw new MailError('送信可能な顧客がいません')
    return this.db.transaction(async db => {
      const rows = await db.query(`UPDATE mail_campaigns SET tested_version=version,updated_at=now()
        WHERE id=$1 AND version=$2 AND status IN ('draft','reviewed') RETURNING id`, [id, version])
      if (!rows.length || before.version !== version) throw new MailError('内容が変更されています。保存して再確認してください', 409)
      const preview = { to: actor.email, sampleCompanyName: sample.companyName, subject: sample.subject, text: sample.text, simulated: true }
      await this.event(db, id, actor, 'test_simulated', preview)
      return preview
    })
  }

  async review(id: string, version: number, actor: Actor) {
    const campaign = await this.campaign(id)
    this.assertCompanyMode(campaign)
    const review = this.recipients(campaign, await this.choices())
    if (!review.some(r => !r.exclusion)) throw new MailError('送信可能な顧客がいません')
    return this.db.transaction(async db => {
      const rows = await db.query(`UPDATE mail_campaigns SET review=$3::jsonb,status='reviewed',updated_at=now()
        WHERE id=$1 AND version=$2 AND tested_version=version AND status IN ('draft','reviewed') RETURNING id`, [id, version, JSON.stringify(review)])
      if (!rows.length || campaign.version !== version) throw new MailError('保存済みの最新版でテストを実行してください', 409)
      await this.event(db, id, actor, 'reviewed')
      return this.campaign(id, db)
    })
  }

  async start(id: string, version: number, actor: Actor) {
    const campaign = await this.campaign(id)
    this.assertCompanyMode(campaign)
    // Re-resolve recipients. Never silently expand or replace the reviewed set.
    const current = this.recipients(campaign, await this.choices())
    if (!isDeepStrictEqual(current, campaign.review)) throw new MailError('宛先情報・契約状態・送信停止設定が変わりました。最終確認をやり直してください', 409)
    return this.db.transaction(async db => {
      const rows = await db.query(`UPDATE mail_campaigns SET status='queued',updated_at=now(),actor_id=$3,actor_name=$4,delivery_mode=$6
        WHERE id=$1 AND version=$2 AND status='reviewed' AND tested_version=version AND review=$5::jsonb RETURNING id`, [id, version, actor.id, actor.name, JSON.stringify(current), this.options.deliveryMode])
      if (!rows.length) throw new MailError('送信開始済みか、内容が変更されています', 409)
      const deliveries = current.map(r => ({ id: randomUUID(), company_id: r.companyId, email_key: r.email.toLowerCase(), snapshot: r, status: r.exclusion ? 'excluded' : 'pending', result: r.exclusion }))
      await db.query(`INSERT INTO mail_deliveries(id,campaign_id,company_id,email_key,snapshot,status,result)
        SELECT r.id::uuid,$1,r.company_id::uuid,r.email_key,r.snapshot,r.status,r.result FROM jsonb_to_recordset($2::jsonb)
        AS r(id text,company_id text,email_key text,snapshot jsonb,status text,result text)`, [id, JSON.stringify(deliveries)])
      await this.event(db, id, actor, this.options.deliveryMode === 'live' ? 'manual_send_started' : 'simulation_started', { count: current.filter(r => !r.exclusion).length })
      return this.campaign(id, db)
    })
  }

  async stop(email: string, stopped: boolean, actor: Actor) {
    const key = z.email().max(254).parse(email.trim()).toLowerCase()
    await this.db.transaction(async db => {
      if (stopped) await db.query('INSERT INTO mail_stops(email_key,actor_id) VALUES($1,$2) ON CONFLICT(email_key) DO NOTHING', [key, actor.id])
      else await db.query('DELETE FROM mail_stops WHERE email_key=$1', [key])
      await this.event(db, null, actor, stopped ? 'address_stopped' : 'address_resumed', { email: key })
    })
  }

  async retry(id: string, version: number, actor: Actor) {
    const campaign = await this.campaign(id)
    this.assertCompanyMode(campaign)
    if (campaign.deliveryMode === 'live') throw new MailError('実送信の処理済み宛先は再送できません。未送信分だけ継続できます', 409)
    return this.db.transaction(async db => {
      const rows = await db.query(`UPDATE mail_campaigns SET status='queued',updated_at=now()
        WHERE id=$1 AND version=$2 AND status='completed' AND EXISTS(SELECT 1 FROM mail_deliveries WHERE campaign_id=$1 AND status='failed') RETURNING id`, [id, version])
      if (!rows.length) throw new MailError('再実行可能な失敗はありません', 409)
      await db.query("UPDATE mail_deliveries SET status='pending',result=NULL WHERE campaign_id=$1 AND status='failed'", [id])
      await this.event(db, id, actor, 'failed_retried')
      return this.campaign(id, db)
    })
  }

  async resume(id: string, version: number, actor: Actor) {
    const campaign = await this.campaign(id)
    if (campaign.version !== version || campaign.deliveryMode !== 'live' || !['queued', 'running'].includes(campaign.status)) throw new MailError('未送信分を継続できる状態ではありません', 409)
    await this.event(this.db, id, actor, 'manual_send_resumed')
    return campaign
  }

  async events(id: string) {
    return this.db.query('SELECT action,detail,created_at FROM mail_events WHERE campaign_id=$1 ORDER BY created_at', [id])
  }
}
