import { z } from 'zod'

export const signature = `──────────────────────
業務データで、現場と経営をつなぐ。
──────────────────────
角谷 亮太｜Acoru合同会社 代表
AI時代の業務基盤を、北海道の現場から。
https://acoru.jp  ✉ support@acoru.jp`

export const draftSchema = z.object({
  subject: z.string().trim().min(1, '件名を入力してください').max(200).regex(/^[^\r\n]+$/, '件名は1行で入力してください'),
  body: z.string().trim().min(1, '本文を入力してください').max(20000),
  companyIds: z.array(z.uuid()).min(1, '顧客を選択してください').max(500),
}).strict().superRefine((value, ctx) => {
  for (const field of ['subject', 'body'] as const) {
    for (const match of value[field].matchAll(/\{\{([^{}]+)\}\}/g)) {
      if (match[1] !== '会社名') ctx.addIssue({ code: 'custom', path: [field], message: `未対応の差し込み項目: ${match[0]}` })
    }
  }
})
export type DraftInput = z.infer<typeof draftSchema>
export type CustomerChoice = {
  id: string; companyName: string; email: string | null; addressVersion: number
  industry: string | null; eligible: boolean; stopped: boolean
}
export type ReviewRecipient = {
  companyId: string; companyName: string; email: string; addressVersion?: number
  // Old contact delivery snapshots remain readable, never executable.
  contactId?: string; name?: string
  subject: string; text: string; exclusion: string | null
  from?: string
}
export type DeliveryStatus = 'pending' | 'sending' | 'simulated' | 'sent' | 'failed' | 'uncertain' | 'excluded'
export type Delivery = ReviewRecipient & { id: string; status: DeliveryStatus; attempts: number; result: string | null }
export type CampaignStatus = 'draft' | 'reviewed' | 'queued' | 'running' | 'completed'
export type Campaign = DraftInput & {
  recipientMode: 'company' | 'contacts'; selectedCount: number
  id: string; version: number; status: CampaignStatus; createdAt: string; updatedAt: string
  actorName: string; testedVersion: number | null; review: ReviewRecipient[] | null; deliveries: Delivery[]
  deliveryMode: 'simulation' | 'live'; processingUntil: string | null
}
export const campaignLabels: Record<CampaignStatus, string> = { draft: '下書き', reviewed: '確認済み', queued: '処理待ち', running: '送信処理中', completed: '処理完了' }
export const deliveryLabels: Record<DeliveryStatus, string> = { pending: '処理待ち', sending: '処理中', simulated: '模擬送信完了', sent: 'メール受付済み', failed: '失敗', uncertain: '結果確認待ち', excluded: '対象外' }

export const addressSchema = z.object({
  companyId: z.uuid(), version: z.number().int().nonnegative(),
  email: z.string().trim().max(254).refine(value => value === '' || z.email().safeParse(value).success, '代表メールの形式が正しくありません'),
}).strict()

export function renderMail(input: Pick<DraftInput, 'subject' | 'body'>, customer: Pick<CustomerChoice, 'companyName'>) {
  // One pass prevents placeholders in a CRM name from being expanded a second time.
  const expand = (s: string) => s.replace(/\{\{会社名\}\}/g, () => customer.companyName)
  return { subject: expand(input.subject).replace(/[\r\n]/g, ' '), text: `${expand(input.body)}\n\n${signature}` }
}

export function reviewRecipients(input: DraftInput, choices: CustomerChoice[]): ReviewRecipient[] {
  const lookup = new Map(choices.map(c => [c.id, c]))
  const seen = new Set<string>()
  return [...new Set(input.companyIds)].map(id => {
    const c = lookup.get(id)
    const email = c?.email?.trim() ?? ''
    let exclusion: string | null = !c ? '顧客が削除されています' : !c.eligible ? '契約済みの有効顧客ではありません' : !email ? '代表メール未登録' : !z.email().max(254).safeParse(email).success ? '代表メールの形式不正' : c.stopped ? '業務連絡の送信停止対象' : null
    const key = email.toLowerCase()
    if (!exclusion && seen.has(key)) exclusion = '同一メールアドレスの重複'
    if (!exclusion) seen.add(key)
    return {
      companyId: id, companyName: c?.companyName ?? '削除済み', email, addressVersion: c?.addressVersion ?? 0,
      ...renderMail(input, c ?? { companyName: '' }), exclusion,
    }
  })
}

export class MailError extends Error {
  constructor(message: string, public status = 400) { super(message); this.name = 'MailError' }
}
export function isMailError(error: unknown): error is MailError {
  // Instrumentation and route bundles share the local repository via globalThis,
  // but can contain separate copies of this class.
  return error instanceof Error && error.name === 'MailError' && 'status' in error && typeof error.status === 'number' && [400, 401, 403, 404, 409, 413].includes(error.status)
}
export function assertMailAdmin(user: { role: string; is_active: boolean } | null) {
  if (!user?.is_active) throw new MailError('ログインしてください', 401)
  if (user.role !== 'admin') throw new MailError('管理者のみ利用できます', 403)
}
export function isLocalMailEnabled(env: Record<string, string | undefined>) {
  return env.BULK_MAIL_LOCAL_ENABLED === 'true' && !env.VERCEL && !env.VERCEL_ENV
}
export function isProductionMailEnabled(env: Record<string, string | undefined>) {
  return env.VERCEL_ENV === 'production' && env.BULK_MAIL_ENABLED === 'true'
}
export function isMailEnabled(env: Record<string, string | undefined>) {
  return isLocalMailEnabled(env) || isProductionMailEnabled(env)
}
