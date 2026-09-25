import Link from 'next/link'
import { billingUser, repository, sendOptions } from '@/lib/billing/server'
import { InvoiceEditor } from '@/components/billing/InvoiceEditor'
import '@/app/billing.css'

export const dynamic = 'force-dynamic'
export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  if (!(await billingUser()))
    return <div className="p-6">管理者権限が必要です。</div>
  const { id } = await params
  const repo = repository()
  const invoice = await repo.invoice(id)
  return (
    <div className="billing">
      <Link className="billing-back" href="/billing">
        ← 請求一覧
      </Link>
      <InvoiceEditor
        key={invoice.version + invoice.status}
        invoice={invoice}
        live={sendOptions().live}
        allowReal={process.env.BILLING_ALLOW_REAL_RECIPIENTS === 'true'}
      />
    </div>
  )
}
