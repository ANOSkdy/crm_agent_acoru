import {
  assertLiveSend,
  emailContent,
  japanClock,
  previousPeriod,
} from './domain'
import type { BillingRepository } from './repository'
import type { Invoice } from './domain'

type Options = {
  live: boolean
  apiKey?: string
  pdf: (invoice: Invoice) => Promise<Buffer>
  fetcher?: typeof fetch
}
export async function deliver(
  repo: BillingRepository,
  id: string,
  actor: string,
  options: Options,
) {
  const invoice = await repo.invoice(id)
  if (!['draft', 'simulated'].includes(invoice.status))
    throw new Error('送信可能な状態ではありません')
  if (invoice.document.reviewNote) throw new Error('移行データの確認が必要です')
  const mode = options.live ? 'live' : 'test'
  if (options.live) assertLiveSend(invoice, true, options.apiKey)
  const pdf = await options.pdf(invoice)
  const content = emailContent(invoice)
  const payload = {
    from: `${invoice.document.issuer.name} <${invoice.document.issuer.from}>`,
    to: [invoice.document.email],
    ...content,
    attachments: [
      {
        filename: `invoice_${invoice.id}.pdf`,
        content: pdf.toString('base64'),
      },
    ],
  }
  // Store the PDF once; the envelope plus pdf_base64 is the immutable send payload.
  const deliveryId = await repo.claim(
    invoice,
    mode,
    { from: payload.from, to: payload.to, ...content },
    pdf.toString('base64'),
    actor,
  )
  if (!deliveryId)
    return {
      status: 'skipped',
      message: 'すでに処理済み、または他の操作で更新されています',
    }
  if (!options.live)
    return {
      status: 'simulated',
      message: '検証記録を作成しました。外部送信は行っていません',
    }
  // Once a request may have reached the provider we never automatically retry it.
  // The permanent unique live-delivery index also survives Resend's 24h key expiry.
  try {
    const response = await (options.fetcher ?? fetch)(
      'https://api.resend.com/emails',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `billing-${deliveryId}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      },
    )
    const result = (await response.json()) as { id?: string }
    if (!response.ok || !result.id) throw new Error('provider_result_unknown')
    await repo.finish(deliveryId, 'sent', result.id, actor)
    return { status: 'sent', message: 'メールサービスが受け付けました' }
  } catch {
    await repo.finish(deliveryId, 'uncertain', null, actor)
    return {
      status: 'uncertain',
      message: '送信結果の確認が必要です。自動再送は停止しました',
    }
  }
}
export async function scheduledRun(
  repo: BillingRepository,
  options: Options,
  now = new Date(),
) {
  const { value: settings } = await repo.settings()
  if (!settings.automation)
    return { enabled: false, created: 0, processed: 0, errors: 0 }
  const clock = japanClock(now)
  const result = { enabled: true, created: 0, processed: 0, errors: 0 }
  if (clock.day >= settings.createDay && clock.hour >= settings.sendHour)
    result.created = (await repo.generate(clock.period, 'cron')).created
  // Only the previous billing month is eligible; historical pending invoices are never swept up.
  if (clock.day >= settings.sendDay && clock.hour >= settings.sendHour) {
    const queue = (await repo.invoices(previousPeriod(clock.period)))
      .filter((i) =>
        options.live
          ? ['draft', 'simulated'].includes(i.status)
          : i.status === 'draft',
      )
      .slice(0, 10)
    for (const invoice of queue) {
      try {
        await deliver(repo, invoice.id, 'cron', options)
        result.processed++
      } catch {
        result.errors++
        await repo.event('cron', 'schedule_failed', invoice.id, {
          message: '請求内容または送信設定を確認してください',
        })
      }
    }
  }
  return result
}
