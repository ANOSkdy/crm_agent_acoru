import { requireApiUser } from '@/lib/auth/deal-permissions'
import { localMailEnabled, mailEnabled, mailRepository } from '@/lib/bulk-mail/server'
import { manualTestSettings } from '@/lib/bulk-mail/manual-test'
import { MailWorkspace } from '@/components/bulk-mail/MailWorkspace'
import '@/app/mail.css'

export const dynamic = 'force-dynamic'
export default async function BulkMailPage({ searchParams }: { searchParams: Promise<{ company?: string; view?: string }> }) {
  const user = await requireApiUser()
  if (user.role !== 'admin') return <div className="p-6"><h1>一斉メール</h1><p>この機能は管理者のみ利用できます。</p></div>
  if (!mailEnabled()) return <div className="p-6"><h1>一斉メール</h1><p>一斉メールは停止中です。</p></div>
  const repo = await mailRepository()
  const [choices, campaigns, params] = await Promise.all([repo.choices(), repo.list(), searchParams])
  return <MailWorkspace initialChoices={choices} initialCampaigns={campaigns} initialCompany={params.company} initialView={params.view} userEmail={user.email} testSettings={manualTestSettings(process.env)} live={!localMailEnabled() && process.env.BULK_MAIL_LIVE_SEND_ENABLED === 'true'} />
}
