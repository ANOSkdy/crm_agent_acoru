import { billingUser, repository, sendOptions } from '@/lib/billing/server'
import { BillingWorkspace } from '@/components/billing/BillingWorkspace'
import { japanClock } from '@/lib/billing/domain'
import '@/app/billing.css'

export const dynamic = 'force-dynamic'
export default async function BillingPage() {
  if (!(await billingUser()))
    return (
      <div className="p-6">
        <h1>請求管理</h1>
        <p>この機能は管理者のみ利用できます。</p>
      </div>
    )
  const repo = repository()
  const [customers, invoices, settings, deliveries, events] = await Promise.all(
    [
      repo.customers(),
      repo.invoices(),
      repo.settings(),
      repo.deliveries(),
      repo.events(),
    ],
  )
  return (
    <BillingWorkspace
      customers={customers}
      invoices={invoices}
      settings={settings}
      deliveries={JSON.parse(JSON.stringify(deliveries))}
      events={JSON.parse(JSON.stringify(events))}
      currentPeriod={japanClock().period}
      live={sendOptions().live}
      allowReal={process.env.BILLING_ALLOW_REAL_RECIPIENTS === 'true'}
    />
  )
}
