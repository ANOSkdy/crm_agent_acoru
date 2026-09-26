import { z } from 'zod'

export const terms = [
  '翌月10日',
  '翌月末日',
  '翌々月1日',
  '翌々月10日',
] as const
export const lineSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().int().min(1).max(100000),
  unitPrice: z.number().int().min(0).max(100000000),
  unit: z.string().trim().max(12).optional(),
})
export const customerSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  name: z.string().trim().min(1).max(120),
  email: z.email().max(254),
  honorific: z.string().trim().min(1).max(20),
  status: z.enum(['契約中', '契約前', '解約']),
  paymentTerm: z.enum(terms),
  lines: z.array(lineSchema).min(1).max(100),
  companyId: z.uuid().nullable().optional(),
  contactId: z.uuid().nullable().optional(),
  sourceDealId: z.uuid().nullable().optional(),
  billingEnabled: z.boolean().optional(),
  templateConfirmed: z.boolean().optional(),
  subject: z.string().trim().max(100).optional(),
})
export const issuerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  registration: z.string().regex(/^T\d{13}$/),
  address: z.string().trim().min(1).max(180),
  tel: z.string().trim().min(1).max(40),
  bank: z.string().trim().min(1).max(500),
  from: z.email(),
})
export const settingsSchema = z.object({
  issuer: issuerSchema,
  automation: z.boolean(),
  createDay: z.number().int().min(1).max(28),
  sendDay: z.number().int().min(1).max(28),
  sendHour: z.number().int().min(0).max(23),
})
export type Line = z.infer<typeof lineSchema>
export type Customer = z.infer<typeof customerSchema> & {
  version: number
  address?: string
  postalCode?: string
}
export type CrmChoice = {
  id: string
  name: string
  contacts: { id: string; name: string; hasEmail: boolean }[]
  deals: { id: string; title: string; amount: number }[]
}
export type Settings = z.infer<typeof settingsSchema>
export type Invoice = {
  id: string
  customer_id: string | null
  company_id?: string | null
  billing_enabled?: boolean
  period: string
  status: 'draft' | 'simulated' | 'held' | 'sending' | 'uncertain' | 'sent'
  document: {
    name: string
    email: string
    honorific: string
    issueDate: string
    dueDate: string
    lines: Line[]
    issuer: Settings['issuer']
    reviewNote?: string
    imported?: boolean
    subject?: string
    dealTitle?: string
    address?: string
    postalCode?: string
    provisional?: boolean
  }
  version: number
  subtotal: number
  tax: number
  total: number
}
export const defaults: Settings = {
  automation: false,
  createDay: 25,
  sendDay: 1,
  sendHour: 9,
  issuer: {
    name: 'Acoru合同会社',
    registration: 'T0000000000000',
    address: '未設定',
    tel: '未設定',
    bank: '未設定',
    from: 'support@acoru.jp',
  },
}
export function validatePeriod(period: string) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period))
    throw new Error('対象月が不正です')
  return period
}
function date(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10)
}
export function invoiceDates(period: string, term: (typeof terms)[number]) {
  validatePeriod(period)
  const [y, m] = period.split('-').map(Number)
  const dueDate =
    term === '翌月10日'
      ? date(y, m, 10)
      : term === '翌月末日'
        ? date(y, m + 1, 0)
        : term === '翌々月1日'
          ? date(y, m + 1, 1)
          : term === '翌々月10日'
            ? date(y, m + 1, 10)
            : ''
  if (!dueDate) throw new Error('支払条件が不正です')
  return { issueDate: date(y, m, 0), dueDate }
}
export function totals(lines: Line[]) {
  z.array(lineSchema).min(1).max(100).parse(lines)
  const subtotal = lines.reduce(
    (sum, line) => sum + line.quantity * line.unitPrice,
    0,
  )
  if (!Number.isSafeInteger(subtotal) || subtotal > 1000000000)
    throw new Error('請求額が上限を超えています')
  const tax = Math.floor(subtotal / 10)
  return { subtotal, tax, total: subtotal + tax }
}
export function isDummy(email: string) {
  return /^[^@\s]+@example\.invalid$/i.test(email)
}
export function assertRecipient(email: string, allowReal = false) {
  z.email().parse(email)
  if (!allowReal && !isDummy(email))
    throw new Error('承認前は example.invalid のダミーアドレスのみ登録できます')
}
export function japanClock(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  return {
    period: `${parts.year}-${parts.month}`,
    day: Number(parts.day),
    hour: Number(parts.hour),
  }
}
export function previousPeriod(period: string) {
  validatePeriod(period)
  const [y, m] = period.split('-').map(Number)
  return date(y, m - 2, 1).slice(0, 7)
}
export function emailContent(invoice: Invoice) {
  const d = invoice.document
  const [year, month] = invoice.period.split('-')
  return {
    subject: `【${d.name}】${year}年${Number(month)}月分のご請求書`,
    text: `${d.name} ${d.honorific}\n\nいつもお世話になっております。\n${d.issuer.name} 角谷です。\n\n${year}年${Number(month)}月分のご請求書をお送りいたします。\n添付ファイルをご確認くださいますようお願い申し上げます。\n\nご不明な点がございましたら、お気軽にお問い合わせください。\n今後とも何卒よろしくお願い申し上げます。\n\n---\n${d.issuer.name}\n${d.issuer.address}\n${d.issuer.tel}`,
  }
}
export function documentSubject(document: Invoice['document']) {
  return (
    document.subject?.trim() ||
    document.dealTitle?.trim() ||
    document.lines[0]?.name.trim() ||
    ''
  )
}
export const statusLabels: Record<Invoice['status'], string> = {
  draft: '送信待ち',
  simulated: '検証済み',
  held: '保留',
  sending: '処理中・要確認',
  uncertain: '送信結果の確認待ち',
  sent: '送信済み',
}
export function assertLiveSend(
  invoice: Invoice,
  enabled: boolean,
  apiKey?: string,
) {
  if (!enabled || !apiKey) throw new Error('本番送信は無効です')
  if (isDummy(invoice.document.email))
    throw new Error('ダミーアドレスには外部送信できません')
  if (invoice.document.reviewNote)
    throw new Error('移行時の不整合を解決してください')
  if (invoice.document.provisional || invoice.total <= 0)
    throw new Error('仮作成の請求内容を確認してください')
  if (
    invoice.document.issuer.bank === '未設定' ||
    invoice.document.issuer.registration === 'T0000000000000'
  )
    throw new Error('請求元情報を設定してください')
  if (!['draft', 'simulated'].includes(invoice.status))
    throw new Error('送信可能な状態ではありません')
}
