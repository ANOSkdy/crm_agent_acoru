import { MailRepository } from './repository'
import { reviewRecipients, type Delivery, type ReviewRecipient } from './domain'

// The local adapter has no mail provider or API key. Results are always simulated.
export async function drainMail(repo: MailRepository, simulate: (mail: ReviewRecipient) => Promise<void> = async () => {}) {
  while (true) {
    const delivery = await repo.db.transaction(async db => {
      const [row] = await db.query(`UPDATE mail_deliveries SET status='sending',attempts=attempts+1,updated_at=now()
        WHERE id=(SELECT d.id FROM mail_deliveries d JOIN mail_campaigns c ON c.id=d.campaign_id
          WHERE d.status='pending' AND c.recipient_mode='company' AND c.delivery_mode='simulation' AND c.status IN ('queued','running') ORDER BY d.updated_at,d.id LIMIT 1 FOR UPDATE OF d SKIP LOCKED)
        AND status='pending' RETURNING *`)
      if (!row) return null
      await db.query("UPDATE mail_campaigns SET status='running',updated_at=now() WHERE id=$1", [row.campaign_id])
      return row
    })
    if (!delivery) break
    const snapshot = delivery.snapshot as ReviewRecipient
    let fresh: ReviewRecipient
    try {
      fresh = reviewRecipients({ subject: '', body: '', companyIds: [snapshot.companyId] }, await repo.choices())[0]
    } catch {
      await repo.db.query("UPDATE mail_deliveries SET status='failed',result='顧客情報を再確認できませんでした',updated_at=now() WHERE id=$1 AND status='sending'", [delivery.id])
      continue
    }
    let status: Delivery['status'] = 'simulated'
    let result = 'ローカル模擬送信が完了しました。実メールは送信していません。'
    if (fresh.exclusion || fresh.email !== snapshot.email || fresh.addressVersion !== snapshot.addressVersion || fresh.companyName !== snapshot.companyName) {
      status = 'excluded'; result = fresh.exclusion ?? '確認後に宛先情報が変更されたため除外しました'
    } else {
      try { await simulate(snapshot) } catch {
        // This adapter cannot send anything, so a simulation failure is safe to retry.
        status = 'failed'; result = '模擬処理に失敗しました。再実行できます。'
      }
    }
    await repo.db.query("UPDATE mail_deliveries SET status=$2,result=$3,updated_at=now() WHERE id=$1 AND status='sending'", [delivery.id, status, result])
  }
  await repo.db.query(`UPDATE mail_campaigns c SET status='completed',updated_at=now() WHERE delivery_mode='simulation' AND status IN ('queued','running')
    AND NOT EXISTS(SELECT 1 FROM mail_deliveries d WHERE d.campaign_id=c.id AND d.status IN ('pending','sending'))`)
}
