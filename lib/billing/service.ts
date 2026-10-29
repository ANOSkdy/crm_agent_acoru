import {
  assertLiveSend,
  emailContent,
  invoiceFilename,
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
  if (invoice.billing_enabled === false)
    throw new Error('この顧客の請求は無効です')
  if (invoice.document.provisional)
    throw new Error('仮作成の請求内容を確認してください')
  if (!['draft', 'simulated'].includes(invoice.status))
    throw new Error('送信可能な状態ではありません')
  if (invoice.document.reviewNote) throw new Error('移行データの確認が必要です')
  if (!options.live) throw new Error('メール送信は停止中です')
  assertLiveSend(invoice, true, options.apiKey)
  const pdf = await options.pdf(invoice)
  const content = emailContent(invoice)
  const payload = {
    from: `${invoice.document.issuer.name} <${invoice.document.issuer.from}>`,
    to: [invoice.document.email],
    ...content,
    attachments: [
      {
        filename: invoiceFilename(invoice.document),
        content: pdf.toString('base64'),
      },
    ],
  }
  // Store the PDF once; the envelope plus pdf_base64 is the immutable send payload.
  const deliveryId = await repo.claim(
    invoice,
    'live',
    { from: payload.from, to: payload.to, ...content },
    pdf.toString('base64'),
    actor,
  )
  if (!deliveryId)
    return {
      status: 'skipped',
      message: 'すでに処理済み、または他の操作で更新されています',
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
    return { enabled: false, created: 0, processed: 0, errors: 0, remaining: 0 }
  const clock = japanClock(now)
  const creationDay = clock.day >= settings.createDay && clock.day <= 28
  const sendingDay = clock.day >= settings.sendDay && clock.day <= 3
  const result = { enabled: true, created: 0, processed: 0, errors: 0, remaining: 0 }
  if (creationDay && clock.hour >= settings.sendHour)
    result.created = (await repo.generate(clock.period, 'cron')).created
  // Only the previous billing month is eligible; historical pending invoices are never swept up.
  if (options.live && sendingDay && clock.hour >= settings.sendHour) {
    const queue = (await repo.invoices(previousPeriod(clock.period)))
      .filter(
        (i) =>
          i.billing_enabled !== false &&
          !i.document.provisional &&
          ['draft', 'simulated'].includes(i.status),
      )
    // Reserve time to record unfinished work before the function's 300s limit.
    const deadline = Date.now() + 240_000
    for (const [index, invoice] of queue.entries()) {
      if (Date.now() >= deadline) {
        result.remaining = queue.length - index
        break
      }
      try {
        const delivery = await deliver(repo, invoice.id, 'cron', options)
        if (delivery.status === 'uncertain') result.errors++
        else if (delivery.status !== 'skipped') result.processed++
      } catch {
        result.errors++
        await repo.event('cron', 'schedule_failed', invoice.id, {
          message: '請求内容または送信設定を確認してください',
        })
      }
    }
  }
  if (creationDay || sendingDay)
    await repo.event('cron', 'schedule_completed', clock.period, result)
  return result
}
