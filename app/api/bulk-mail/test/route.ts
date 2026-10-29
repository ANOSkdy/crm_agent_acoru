import { z } from 'zod'
import { AppError } from '@/lib/http/errors'
import { checkMutationRequest } from '@/lib/http/api'
import { isMailError, MailError } from '@/lib/bulk-mail/domain'
import { assertTestHost, manualTestSettings, ManualTestMail, testContentSchema } from '@/lib/bulk-mail/manual-test'
import { mailRepository, mailUser } from '@/lib/bulk-mail/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('prepare'), data: testContentSchema }).strict(),
  z.object({ action: z.literal('send'), id: z.uuid(), confirmed: z.literal(true) }).strict(),
])

export async function POST(request: Request) {
  try {
    const user = await mailUser()
    checkMutationRequest(request)
    assertTestHost(request.headers.get('host'), process.env)
    const raw = await request.text()
    if (raw.length > 60000) throw new MailError('入力が大きすぎます', 413)
    const input = command.parse(JSON.parse(raw))
    const repo = await mailRepository()
    const tests = new ManualTestMail(repo.db)
    const actor = { id: user.id, name: user.name, email: user.email }
    const prepared = input.action === 'prepare'
      ? await tests.prepare(input.data, actor, process.env)
      : await tests.send(input.id, actor, process.env)
    return Response.json({ prepared, settings: manualTestSettings(process.env) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (isMailError(error) || error instanceof AppError) return Response.json({ error: error.message }, { status: error.status })
    if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: '入力内容を確認してください' }, { status: 400 })
    return Response.json({ error: 'テスト処理を完了できませんでした。送信ボタンを押した場合は、送信結果を確認してください。自動再送は行いません。' }, { status: 500 })
  }
}
