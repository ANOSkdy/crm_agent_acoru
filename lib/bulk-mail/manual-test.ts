import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { isMailEnabled, isProductionMailEnabled, MailError, signature } from './domain'
import type { Actor, MailDb } from './repository'

type Environment = Record<string, string | undefined>
export const testContentSchema = z.object({
  subject: z.string().trim().min(1).max(200).regex(/^[^\r\n]+$/),
  body: z.string().trim().min(1).max(20000),
}).strict().refine(value => !/\{\{[^{}]+\}\}/.test(value.subject + value.body), 'テスト用の文面には会社名などを直接入力してください')

export type TestContent = z.infer<typeof testContentSchema>
export type TestSettings = { to: string; from: string; canSend: boolean; reason: string | null }
export type TestPayload = { from: string; to: [string]; subject: string; text: string }
export type PreparedTest = {
  id: string; payload: TestPayload; status: 'prepared' | 'sending' | 'sent' | 'uncertain'
  providerId: string | null; createdAt: string
}

export function manualTestSettings(env: Environment): TestSettings {
  const to = env.BULK_MAIL_TEST_TO?.trim() ?? ''
  const from = env.BULK_MAIL_TEST_FROM?.trim() ?? ''
  let reason: string | null = null
  if (!isMailEnabled(env) || (!isProductionMailEnabled(env) && env.NODE_ENV !== 'development')) reason = '実メールのテストはローカル開発または有効な本番環境で利用できます。'
  else if (env.BULK_MAIL_TEST_ENABLED !== 'true') reason = '手動テスト送信が無効です。'
  else if (!z.email().max(254).safeParse(to).success || !z.email().max(254).safeParse(from).success) reason = 'テスト用の送信元・宛先が未設定です。'
  else if (!testApiKey(env)) reason = '送信用APIキーが未設定です。メール送信設定を確認してください。'
  return { to, from, canSend: !reason, reason }
}

export function assertTestHost(host: string | null, env: Environment = {}) {
  if (isProductionMailEnabled(env)) {
    try {
      const origin = new URL(env.BULK_MAIL_ORIGIN ?? '')
      if (origin.protocol === 'https:' && origin.origin === env.BULK_MAIL_ORIGIN && host === origin.host) return
      if (env.VERCEL_URL && host === env.VERCEL_URL && /^[a-z0-9-]+\.vercel\.app$/.test(host)) return
    } catch { /* Production requires an explicit trusted origin. */ }
    throw new MailError('許可された本番ホストから操作してください', 403)
  }
  try {
    const url = new URL(`http://${host}`)
    if (host && url.host === host && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.pathname === '/' && !url.username && !url.password) return
  } catch { /* Invalid Host must fail closed. */ }
  throw new MailError('ローカルホストから操作してください', 403)
}
function testApiKey(env: Environment) {
  return env.BULK_MAIL_TEST_API_KEY?.trim() || (isProductionMailEnabled(env) ? env.RESEND_API_KEY?.trim() : undefined)
}

function payloadFor(raw: TestContent, settings: TestSettings): TestPayload {
  const input = testContentSchema.parse(raw)
  if (!z.email().max(254).safeParse(settings.to).success || !z.email().max(254).safeParse(settings.from).success) throw new MailError('テスト用の送信元・宛先を設定してください')
  return { from: `Acoru合同会社 <${settings.from}>`, to: [settings.to], subject: input.subject.startsWith('【テスト】') ? input.subject : `【テスト】${input.subject}`, text: `${input.body}\n\n${signature}` }
}

function toPrepared(row: Record<string, unknown>): PreparedTest {
  return { id: String(row.id), payload: row.payload as TestPayload, status: row.status as PreparedTest['status'], providerId: row.provider_id == null ? null : String(row.provider_id), createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at) }
}

export class ManualTestMail {
  constructor(private readonly db: MailDb) {}

  async prepare(raw: TestContent, actor: Actor, env: Environment): Promise<PreparedTest> {
    if (!isMailEnabled(env) || (!isProductionMailEnabled(env) && env.NODE_ENV !== 'development') || env.BULK_MAIL_TEST_ENABLED !== 'true') throw new MailError('手動テスト送信は停止中です', 403)
    const payload = payloadFor(raw, manualTestSettings(env))
    const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
    return this.db.transaction(async db => {
      // Repeated prepares and page reloads reuse the same durable send record.
      await db.query(`INSERT INTO mail_manual_tests(id,actor_id,fingerprint,payload) VALUES($1,$2,$3,$4::jsonb)
        ON CONFLICT(actor_id,fingerprint) DO NOTHING`, [randomUUID(), actor.id, fingerprint, JSON.stringify(payload)])
      const [row] = await db.query('SELECT * FROM mail_manual_tests WHERE actor_id=$1 AND fingerprint=$2', [actor.id, fingerprint])
      return toPrepared(row)
    })
  }

  async send(id: string, actor: Actor, env: Environment, fetcher: typeof fetch = fetch): Promise<PreparedTest> {
    const settings = manualTestSettings(env)
    if (!settings.canSend) throw new MailError(settings.reason!, 403)
    const claimed = await this.db.transaction(async db => {
      const [row] = await db.query(`UPDATE mail_manual_tests SET status='sending',updated_at=now()
        WHERE id=$1 AND actor_id=$2 AND status='prepared'
          AND payload->>'from'=$3 AND payload->'to'=$4::jsonb RETURNING *`, [z.uuid().parse(id), actor.id, `Acoru合同会社 <${settings.from}>`, JSON.stringify([settings.to])])
      if (!row) throw new MailError('送信済み・処理中、または送信設定が変わっています。同じ内容は再送しません', 409)
      await db.query(`INSERT INTO mail_events(id,actor_id,action,detail) VALUES($1,$2,'manual_test_started',$3::jsonb)`, [randomUUID(), actor.id, JSON.stringify({ actorName: actor.name, testId: id, to: settings.to })])
      return toPrepared(row)
    })
    // Only the explicit confirmation POST calls this function. No worker,
    // timer, retry loop, page load or preparation can call the provider.
    let providerId: string | null = null
    try {
      const response = await fetcher('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${testApiKey(env)}`, 'Content-Type': 'application/json', 'Idempotency-Key': `local-manual-test-${id}` },
        body: JSON.stringify(claimed.payload), signal: AbortSignal.timeout(20000),
      })
      const result: unknown = await response.json()
      if (response.ok && typeof result === 'object' && result !== null && 'id' in result && typeof result.id === 'string' && z.uuid().safeParse(result.id).success) providerId = result.id
    } catch { /* An ambiguous response must never trigger an automatic resend. */ }
    const status = providerId ? 'sent' : 'uncertain'
    const [row] = await this.db.query('UPDATE mail_manual_tests SET status=$2,provider_id=$3,updated_at=now() WHERE id=$1 RETURNING *', [id, status, providerId])
    await this.db.query(`INSERT INTO mail_events(id,actor_id,action,detail) VALUES($1,$2,$3,$4::jsonb)`, [randomUUID(), actor.id, `manual_test_${status}`, JSON.stringify({ actorName: actor.name, testId: id, to: settings.to, providerId })])
    return toPrepared(row)
  }
}
