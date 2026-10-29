import { z } from 'zod'
import { after } from 'next/server'
import { AppError } from '@/lib/http/errors'
import { checkMutationRequest } from '@/lib/http/api'
import { addressSchema, draftSchema, isMailError, MailError } from '@/lib/bulk-mail/domain'
import { localMailEnabled, mailRepository, mailUser, runLocalMailWorker } from '@/lib/bulk-mail/server'
import { assertTestHost } from '@/lib/bulk-mail/manual-test'
import { assertLiveMail, sendCampaign } from '@/lib/bulk-mail/live-send'
import { drainMail } from '@/lib/bulk-mail/worker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300
const reference = { id: z.uuid(), version: z.number().int().positive() }
const command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), data: draftSchema, id: z.uuid().optional(), version: z.number().int().positive().optional() }).strict(),
  z.object({ action: z.literal('test'), ...reference }).strict(),
  z.object({ action: z.literal('review'), ...reference }).strict(),
  z.object({ action: z.literal('start'), ...reference, confirmed: z.literal(true) }).strict(),
  z.object({ action: z.literal('resume'), ...reference, confirmed: z.literal(true) }).strict(),
  z.object({ action: z.literal('retry'), ...reference }).strict(),
  z.object({ action: z.literal('stop'), email: z.email(), stopped: z.boolean() }).strict(),
  z.object({ action: z.literal('address'), data: addressSchema }).strict(),
])
function failure(error: unknown) {
  if (isMailError(error) || error instanceof AppError) return Response.json({ error: error.message }, { status: error.status })
  if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: '入力内容を確認してください' }, { status: 400 })
  return Response.json({ error: 'メールの処理に失敗しました。接続と設定を確認してください' }, { status: 500 })
}
export async function GET(request: Request) {
  try {
    await mailUser()
    const repo = await mailRepository()
    const params = new URL(request.url).searchParams
    const id = params.get('id')
    const company = params.get('company')
    if (id) return Response.json({ campaign: await repo.campaign(z.uuid().parse(id)), events: await repo.events(id) }, { headers: { 'Cache-Control': 'private, no-store' } })
    return Response.json({ choices: await repo.choices(), campaigns: await repo.list(company ? z.uuid().parse(company) : undefined) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return failure(error) }
}
export async function POST(request: Request) {
  try {
    const user = await mailUser()
    checkMutationRequest(request)
    assertTestHost(request.headers.get('host'), process.env)
    const raw = await request.text()
    if (raw.length > 60000) throw new MailError('入力が大きすぎます', 413)
    const input = command.parse(JSON.parse(raw))
    const repo = await mailRepository()
    const actor = { id: user.id, name: user.name, email: user.email }
    switch (input.action) {
      case 'address': await repo.saveAddress(input.data, actor); return Response.json({ choices: await repo.choices() })
      case 'save': return Response.json({ campaign: await repo.save(input.data, actor, input.id, input.version) })
      case 'test': return Response.json({ preview: await repo.test(input.id, input.version, actor) })
      case 'review': return Response.json({ campaign: await repo.review(input.id, input.version, actor) })
      case 'start': {
        if (repo.options.deliveryMode === 'live') assertLiveMail(process.env)
        const campaign = await repo.start(input.id, input.version, actor)
        if (localMailEnabled()) void runLocalMailWorker()
        else after(async () => {
          if (campaign.deliveryMode === 'live') await sendCampaign(repo, campaign.id, process.env)
          else await drainMail(repo)
        })
        return Response.json({ campaign })
      }
      case 'resume': {
        assertLiveMail(process.env)
        const campaign = await repo.resume(input.id, input.version, actor)
        after(async () => { await sendCampaign(repo, campaign.id, process.env) })
        return Response.json({ campaign })
      }
      case 'retry': {
        const campaign = await repo.retry(input.id, input.version, actor)
        if (localMailEnabled()) void runLocalMailWorker()
        else after(async () => { await drainMail(repo) })
        return Response.json({ campaign })
      }
      case 'stop': await repo.stop(input.email, input.stopped, actor); return Response.json({ choices: await repo.choices() })
    }
  } catch (error) { return failure(error) }
}
