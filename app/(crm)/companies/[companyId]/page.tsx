export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCompanyById } from '@/lib/db/queries/companies'
import { getContacts } from '@/lib/db/queries/contacts'
import { getDeals, getDealStages } from '@/lib/db/queries/deals'
import { getTasksByCompany } from '@/lib/db/queries/tasks'
import { requireApiUser } from '@/lib/auth/deal-permissions'
import { deleteCompanyAction } from '@/lib/actions/companies'
import { DeleteCompanyButton } from './DeleteCompanyButton'
import { CompanyProperties } from '@/components/grid/RecordProperties'
import { ContactsGrid } from '@/components/grid/ContactsGrid'
import { DealsGrid } from '@/components/grid/DealsGrid'
import { billingUser, repository } from '@/lib/billing/server'
import { formatDisplayDateTime } from '@/lib/utils/date'
import { mailEnabled, mailRepository } from '@/lib/bulk-mail/server'
import { campaignLabels } from '@/lib/bulk-mail/domain'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function CompanyDetailPage({ params }: Props) {
  const { companyId } = await params
  const [company, contacts, deals, tasks, stages, user] = await Promise.all([
    getCompanyById(companyId),
    getContacts(companyId),
    getDeals({ companyId }),
    getTasksByCompany(companyId),
    getDealStages(),
    requireApiUser(),
  ])

  if (!company) notFound()
  const canWrite = user.role !== 'viewer'

  const billingAdmin = await billingUser()
  const billingCustomer = billingAdmin
    ? (await repository().customers()).find((c) => c.companyId === companyId)
    : null
  const linkedInvoices = billingAdmin
    ? (await repository().invoices())
        .filter((i) => i.company_id === companyId)
        .slice(0, 6)
    : []
  const mailRepo = billingAdmin && mailEnabled() ? await mailRepository() : null
  const [mailHistory, mailAddress] = mailRepo
    ? await Promise.all([mailRepo.list(companyId), mailRepo.address(companyId)])
    : [null, null]
  const openTasks = tasks.filter((t) => ['open', 'in_progress'].includes(t.status)).length

  async function deleteAction() {
    'use server'
    await deleteCompanyAction(companyId)
  }

  return (
    <div className="workspace">
      <div className="workspace__bar">
        <Link href="/companies" className="workspace__back">顧客</Link>
        <h1 className="workspace__title">{company.name}</h1>
        <span className="workspace__meta">{[company.industry, company.address].filter(Boolean).join(' · ')}</span>
        <span className="workspace__spacer" />
        <div className="workspace__actions">
          <Link href={`/tasks?company=${companyId}`} className="btn btn--sm">課題 {openTasks > 0 ? `${openTasks}件対応中` : `${tasks.length}件`}</Link>
          {billingAdmin && <Link href={`/billing?company=${companyId}`} className="btn btn--sm">請求設定</Link>}
          {user.role === 'admin' && <form action={deleteAction}><DeleteCompanyButton /></form>}
        </div>
      </div>
      <div className="workspace__body workspace__body--padded">
        <div className="record-layout">
          <section className="panel">
            <div className="panel__head"><h2 className="panel__title">基本情報</h2>{canWrite && <span className="panel__hint">項目をクリックして編集</span>}</div>
            <CompanyProperties company={company} canEdit={canWrite} />
          </section>

          <section className="panel record-layout__grid">
            <ContactsGrid title="担当者" contacts={contacts} fixedCompanyId={companyId} canWrite={canWrite} />
          </section>

          <section className="panel record-layout__grid">
            <DealsGrid title="案件" deals={deals} stages={stages.map((s) => ({ id: s.id, name: s.name }))} fixedCompanyId={companyId} canWrite={canWrite} ownerOnlyUserId={user.role === 'admin' ? undefined : user.id} />
          </section>

          {billingAdmin && (
            <section className="panel">
              <div className="panel__head"><h2 className="panel__title">請求設定・請求履歴</h2><span className="workspace__spacer" /><Link className="btn btn--sm" href={`/billing?company=${companyId}`}>請求の有効／無効を設定</Link></div>
              <div className="panel__body">
                <p>請求：{billingCustomer?.billingEnabled ? '有効' : '無効'} ／ 有効にすると今月分の請求書を仮作成します。</p>
                <div className="record-links">
                  {linkedInvoices.map((i) => (
                    <Link key={i.id} className="crm-grid__link" href={`/billing/${i.id}`}>{i.period}　{Number(i.total).toLocaleString()}円</Link>
                  ))}
                </div>
              </div>
            </section>
          )}

          {mailHistory ? <section className="panel">
            <div className="panel__head"><h2 className="panel__title">業務連絡メール</h2><span className="workspace__spacer" /><Link href={`/bulk-mail?company=${companyId}`} className="crm-grid__link">メールを作成・履歴を確認</Link></div>
            <div className="panel__body">
              <p>業務連絡用代表メール：{mailAddress?.email || '未登録'} <Link href={`/bulk-mail?company=${companyId}&view=addresses`} className="crm-grid__link">代表メールを設定</Link></p>
              {mailHistory.length ? <ul className="record-list">{mailHistory.slice(0, 5).map(mail => <li key={mail.id}><Link href={`/bulk-mail?company=${companyId}`} className="crm-grid__link">{mail.subject}</Link><p>{campaignLabels[mail.status]} · {formatDisplayDateTime(mail.updatedAt)} · {mail.review?.filter(r => r.companyId === companyId && !r.exclusion).map(r => r.email).join('、')}</p></li>)}</ul> : <p className="record-muted">業務連絡メールの履歴はありません。</p>}
            </div>
          </section> : null}
        </div>
      </div>
    </div>
  )
}
