import { billingUser, repository, sendOptions } from '@/lib/billing/server'
import { deliver } from '@/lib/billing/service'
import { lineSchema } from '@/lib/billing/domain'
import { z } from 'zod'

export const runtime = 'nodejs'
export const maxDuration = 60
const version = z.number().int().nonnegative()
const date = z.iso.date()
const command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('generate'), period: z.string() }),
  z.object({ action: z.literal('customer'), data: z.unknown(), version }),
  z.object({ action: z.literal('settings'), data: z.unknown(), version }),
  z.object({ action: z.literal('deliver'), id: z.string().max(100) }),
  z.object({
    action: z.literal('invoice'),
    id: z.string().max(100),
    version,
    name: z.string().trim().min(1).max(120),
    email: z.email(),
    honorific: z.string().trim().min(1).max(20),
    dueDate: date,
    lines: z.array(lineSchema).min(1).max(100),
    status: z.enum(['draft', 'held']),
  }),
])
export async function POST(request: Request) {
  const user = await billingUser()
  if (!user)
    return Response.json({ error: '管理者権限が必要です' }, { status: 403 })
  const origin = request.headers.get('origin')
  if (!origin || origin !== new URL(request.url).origin)
    return Response.json({ error: '不正なリクエストです' }, { status: 403 })
  const repo = repository()
  try {
    const body = await request.text()
    if (body.length > 100000)
      return Response.json({ error: '入力が大きすぎます' }, { status: 413 })
    const input = command.parse(JSON.parse(body))
    const allowReal = process.env.BILLING_ALLOW_REAL_RECIPIENTS === 'true'
    if (input.action === 'generate')
      return Response.json(await repo.generate(input.period, user.id))
    if (input.action === 'customer')
      await repo.saveCustomer(input.data, input.version, user.id, allowReal)
    if (input.action === 'settings')
      await repo.saveSettings(input.data, input.version, user.id)
    if (input.action === 'deliver')
      return Response.json(
        await deliver(repo, input.id, user.id, sendOptions()),
      )
    if (input.action === 'invoice') {
      const invoice = await repo.invoice(input.id)
      if (input.dueDate < invoice.document.issueDate)
        throw new Error('支払期日は請求日以降にしてください')
      if (invoice.document.reviewNote && input.status !== 'held')
        throw new Error('移行データに不整合があるため保留を解除できません')
      await repo.updateInvoice(
        input.id,
        input.version,
        {
          ...invoice.document,
          name: input.name,
          email: input.email,
          honorific: input.honorific,
          dueDate: input.dueDate,
          lines: input.lines,
        },
        input.status,
        user.id,
        allowReal,
      )
    }
    return Response.json({ message: '保存しました' })
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        {
          error: '入力内容を確認してください',
          fields: error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        { status: 400 },
      )
    // Do not expose database errors, connection strings or provider responses.
    const message =
      error instanceof Error && /[ぁ-んァ-ヶ一-龠]/.test(error.message)
        ? error.message
        : '処理に失敗しました。入力内容と接続設定を確認してください'
    return Response.json({ error: message }, { status: 400 })
  }
}
