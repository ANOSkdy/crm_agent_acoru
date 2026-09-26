import { billingUser, repository } from '@/lib/billing/server'
import { TemplateWorkbench } from '@/components/billing/TemplateWorkbench'
import '@/app/billing.css'

export const dynamic = 'force-dynamic'
export default async function TemplatesPage() {
  if (!(await billingUser()))
    return <div className="p-6">この機能は管理者のみ利用できます。</div>
  const customers = await repository().customers()
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
  }).format(new Date())
  return (
    <TemplateWorkbench
      today={today}
      customers={customers.map((c) => ({
        id: c.id,
        name: c.name,
        honorific: c.honorific,
        subject: c.subject ?? '',
        lines: c.lines,
      }))}
    />
  )
}
