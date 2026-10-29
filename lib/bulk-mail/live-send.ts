import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { isProductionMailEnabled, MailError, reviewRecipients, type DeliveryStatus, type ReviewRecipient } from './domain'
import type { MailRepository } from './repository'

type Environment = Record<string, string | undefined>
export function assertLiveMail(env: Environment) {
  if (!isProductionMailEnabled(env) || env.BULK_MAIL_LIVE_SEND_ENABLED !== 'true' || !env.RESEND_API_KEY?.trim() || !z.email().max(254).safeParse(env.BULK_MAIL_FROM?.trim()).success) throw new MailError('業務連絡メールの実送信設定を確認してください', 403)
}

// Started only by an authenticated, confirmed POST. Deployment, GET, cron and
// startup never call this function. Unfinished batches need a manual resume.
export async function sendCampaign(repo: MailRepository, campaignId: string, env: Environment, options: { fetcher?: typeof fetch; deadlineMs?: number; pause?: () => Promise<void> } = {}) {
  assertLiveMail(env)
  const token = randomUUID(), deadline = Date.now() + (options.deadlineMs ?? 230000)
  const [lease] = await repo.db.query(`UPDATE mail_campaigns SET lease_token=$2,lease_until=now()+interval '5 minutes',status='running'
    WHERE id=$1 AND recipient_mode='company' AND delivery_mode='live' AND status IN ('queued','running')
      AND (lease_until IS NULL OR lease_until<now()) RETURNING id`, [z.uuid().parse(campaignId), token])
  if (!lease) return
  try {
    // A request killed after its durable claim may already have sent. Exclude
    // those from all future attempts, including after the provider's key expiry.
    await repo.db.query("UPDATE mail_deliveries SET status='uncertain',result='中断した送信の結果をResendで確認してください',updated_at=now() WHERE campaign_id=$1 AND status='sending' AND updated_at<now()-interval '5 minutes'", [campaignId])
    while (Date.now() + 25000 < deadline) {
      const [delivery] = await repo.db.query(`UPDATE mail_deliveries SET status='sending',attempts=attempts+1,updated_at=now()
        WHERE id=(SELECT d.id FROM mail_deliveries d JOIN mail_campaigns c ON c.id=d.campaign_id
          WHERE d.campaign_id=$1 AND d.status='pending' AND c.lease_token=$2 AND c.lease_until>now()
          ORDER BY d.updated_at,d.id LIMIT 1 FOR UPDATE OF d SKIP LOCKED) AND status='pending' RETURNING *`, [campaignId, token])
      if (!delivery) break
      const snapshot = delivery.snapshot as ReviewRecipient
      let status: DeliveryStatus = 'uncertain', result = '送信結果をResendで確認してください。再送は停止しています。', providerId: string | null = null
      let fresh: ReviewRecipient
      try { fresh = reviewRecipients({ subject: '', body: '', companyIds: [snapshot.companyId] }, await repo.choices())[0] } catch {
        await repo.db.query("UPDATE mail_deliveries SET status='failed',result='送信前の顧客情報確認に失敗しました（未送信）',updated_at=now() WHERE id=$1 AND status='sending'", [delivery.id])
        break
      }
      if (fresh.exclusion || fresh.email !== snapshot.email || fresh.addressVersion !== snapshot.addressVersion || fresh.companyName !== snapshot.companyName) {
        status = 'excluded'; result = fresh.exclusion ?? '確認後に顧客情報が変更されたため除外しました'
      } else if (snapshot.from !== `Acoru合同会社 <${env.BULK_MAIL_FROM!.trim()}>`) {
        status = 'excluded'; result = '確認後に送信元が変更されたため除外しました'
      } else {
        try {
          const response = await (options.fetcher ?? fetch)('https://api.resend.com/emails', {
            method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY!.trim()}`, 'Content-Type': 'application/json', 'Idempotency-Key': `bulk-manual-${delivery.id}` },
            body: JSON.stringify({ from: snapshot.from, to: [snapshot.email], subject: snapshot.subject, text: snapshot.text }), signal: AbortSignal.timeout(20000),
          })
          const data: unknown = await response.json()
          if (response.ok && typeof data === 'object' && data !== null && 'id' in data && z.uuid().safeParse(data.id).success) {
            providerId = String(data.id); status = 'sent'; result = `メールサービス受付済み（${providerId}）`
          }
        } catch { /* The durable sending claim prevents all automatic retries. */ }
      }
      await repo.db.query('UPDATE mail_deliveries SET status=$2,result=$3,provider_id=$4,updated_at=now() WHERE id=$1 AND status=\'sending\'', [delivery.id, status, result, providerId])
      if (status === 'uncertain') break
      await (options.pause?.() ?? new Promise<void>(r => setTimeout(r, 650)))
    }
    await repo.db.query(`UPDATE mail_campaigns c SET status='completed',updated_at=now() WHERE id=$1 AND lease_token=$2
      AND NOT EXISTS(SELECT 1 FROM mail_deliveries d WHERE d.campaign_id=c.id AND d.status IN ('pending','sending'))`, [campaignId, token])
  } finally {
    await repo.db.query('UPDATE mail_campaigns SET lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2', [campaignId, token])
  }
}
