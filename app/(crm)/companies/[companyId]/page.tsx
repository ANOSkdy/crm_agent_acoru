export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getCompanyById } from '@/lib/db/queries/companies'
import { getContacts } from '@/lib/db/queries/contacts'
import { getDeals, getDealStages } from '@/lib/db/queries/deals'
import { getTasksByCompany } from '@/lib/db/queries/tasks'
import { Badge, stageBadgeVariant, statusBadgeVariant } from '@/components/ui/Badge'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { createContactAction, deleteContactAction } from '@/lib/actions/contacts'
import { createDealAction, deleteDealAction } from '@/lib/actions/deals'
import { deleteCompanyAction } from '@/lib/actions/companies'
import { DeleteCompanyButton } from './DeleteCompanyButton'
import Link from 'next/link'
import { billingUser, repository } from '@/lib/billing/server'
import { formatDisplayDate, formatDisplayDateTime } from '@/lib/utils/date'
import { mailEnabled, mailRepository } from '@/lib/bulk-mail/server'
import { campaignLabels } from '@/lib/bulk-mail/domain'

const formatDate = formatDisplayDate

interface Props {
  params: Promise<{ companyId: string }>
}




export default async function CompanyDetailPage({ params }: Props) {
  const { companyId } = await params
  const [company, contacts, deals, tasks, stages] = await Promise.all([
    getCompanyById(companyId),
    getContacts(companyId),
    getDeals({ companyId }),
    getTasksByCompany(companyId),
    getDealStages(),
  ])

  if (!company) notFound()

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


  async function deleteAction() {
    'use server'
    await deleteCompanyAction(companyId)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{company.name}</h1>
          <p className="text-sm text-gray-500 mt-1">{company.industry ?? ''} · {company.address ?? ''}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/companies/${companyId}/edit`}
            className="px-3 py-2 text-sm border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50"
          >
            編集
          </Link>
          <form action={deleteAction}>
            <DeleteCompanyButton />
          </form>
        </div>
      </div>

      {/* Basic Info */}
      <Card>
        <CardHeader><h2 className="font-semibold">基本情報</h2></CardHeader>
        <CardBody>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div><dt className="text-gray-500">ステータス</dt><dd><Badge variant={statusBadgeVariant(company.status)}>{company.status === 'active' ? 'アクティブ' : '非アクティブ'}</Badge></dd></div>
            <div><dt className="text-gray-500">電話番号</dt><dd>{company.phone ?? '-'}</dd></div>
            <div><dt className="text-gray-500">ウェブサイト</dt><dd>{company.website_url ? <a href={company.website_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{company.website_url}</a> : '-'}</dd></div>
            <div><dt className="text-gray-500">法人番号</dt><dd>{company.corporate_number ?? '-'}</dd></div>
            <div><dt className="text-gray-500">流入元</dt><dd>{company.source ?? '-'}</dd></div>
            <div><dt className="text-gray-500">郵便番号</dt><dd>{company.postal_code ?? '-'}</dd></div>
            <div className="col-span-2"><dt className="text-gray-500">メモ</dt><dd className="whitespace-pre-wrap">{company.memo ?? '-'}</dd></div>
          </dl>
        </CardBody>
      </Card>

      {/* Billing */}
      {billingAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">請求設定・請求履歴</h2>
              <Link
                className="btn btn--primary"
                href={`/billing?company=${companyId}`}
              >
                請求の有効／無効を設定
              </Link>
            </div>
          </CardHeader>
          <CardBody>
            <p>
              請求：{billingCustomer?.billingEnabled ? '有効' : '無効'} ／
              有効にすると今月分の請求書を仮作成します。
            </p>
            <div className="flex flex-wrap gap-3 mt-3">
              {linkedInvoices.map((i) => (
                <Link
                  key={i.id}
                  className="text-blue-600 underline"
                  href={`/billing/${i.id}`}
                >
                  {i.period}　{Number(i.total).toLocaleString()}円
                </Link>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Contacts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">担当者</h2>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {contacts.length > 0 && (
            <table className="w-full text-sm divide-y divide-gray-100">
              <thead><tr className="bg-gray-50"><th className="px-6 py-2 text-left text-xs text-gray-500">名前</th><th className="px-6 py-2 text-left text-xs text-gray-500">部署</th><th className="px-6 py-2 text-left text-xs text-gray-500">役職</th><th className="px-6 py-2 text-left text-xs text-gray-500">メール</th><th className="px-6 py-2 text-left text-xs text-gray-500">KDM</th><th className="px-6 py-2 text-left text-xs text-gray-500">操作</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {contacts.map((c) => (
                  <tr key={c.id}>
                    <td className="px-6 py-2 font-medium">{c.name}</td>
                    <td className="px-6 py-2 text-gray-600">{c.department ?? '-'}</td>
                    <td className="px-6 py-2 text-gray-600">{c.position ?? '-'}</td>
                    <td className="px-6 py-2 text-gray-600">{c.email ?? '-'}</td>
                    <td className="px-6 py-2">{c.is_decision_maker ? '✓' : ''}</td><td className="px-6 py-2 whitespace-nowrap"><Link href={`/contacts/${c.id}/edit`} className="text-xs text-blue-600 hover:underline mr-2">編集</Link><form action={deleteContactAction.bind(null, c.id, companyId)} className="inline"><button type="submit" className="text-xs text-red-500 hover:underline">削除</button></form></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="px-6 py-4 border-t border-gray-100">
            <details>
              <summary className="text-sm text-blue-600 cursor-pointer hover:underline">+ 担当者を追加</summary>
              <form action={createContactAction} className="mt-3 space-y-3">
                <input type="hidden" name="company_id" value={companyId} />
                <div className="grid grid-cols-2 gap-3">
                  <input name="name" placeholder="氏名 *" required className="px-3 py-2 border border-gray-300 rounded text-sm" />
                  <input name="department" placeholder="部署" className="px-3 py-2 border border-gray-300 rounded text-sm" />
                  <input name="position" placeholder="役職" className="px-3 py-2 border border-gray-300 rounded text-sm" />
                  <input name="email" type="email" placeholder="メール" className="px-3 py-2 border border-gray-300 rounded text-sm" />
                  <input name="phone" placeholder="電話" className="px-3 py-2 border border-gray-300 rounded text-sm" />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="is_decision_maker" value="true" />
                  キーマン
                </label>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">追加</button>
              </form>
            </details>
          </div>
        </CardBody>
      </Card>

      {/* Deals */}
      <Card>
        <CardHeader><h2 className="font-semibold">案件</h2></CardHeader>
        <CardBody className="p-0">
          {deals.length > 0 && (
            <table className="w-full text-sm divide-y divide-gray-100">
              <thead><tr className="bg-gray-50"><th className="px-6 py-2 text-left text-xs text-gray-500">案件名</th><th className="px-6 py-2 text-left text-xs text-gray-500">営業ステージ</th><th className="px-6 py-2 text-right text-xs text-gray-500">案件金額（円）</th><th className="px-6 py-2 text-right text-xs text-gray-500">受注確度（%）</th><th className="px-6 py-2 text-left text-xs text-gray-500">受注予定日</th><th className="px-6 py-2 text-left text-xs text-gray-500">操作</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {deals.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-6 py-2"><Link href={`/deals/${d.id}`} className="text-blue-600 hover:underline font-medium">{d.title}</Link></td>
                    <td className="px-6 py-2"><Badge variant={stageBadgeVariant(d.stage_name)}>{d.stage_name ?? '-'}</Badge></td>
                    <td className="px-6 py-2 text-right">¥{Number(d.amount).toLocaleString()}</td>
                    <td className="px-6 py-2 text-right">{d.probability}%</td>
                    <td className="px-6 py-2 text-gray-600">{formatDate(d.expected_close_date)}</td><td className="px-6 py-2 whitespace-nowrap"><Link href={`/deals/${d.id}/edit`} className="text-xs text-blue-600 hover:underline mr-2">編集</Link><form action={deleteDealAction.bind(null, d.id, companyId)} className="inline"><button type="submit" className="text-xs text-red-500 hover:underline">削除</button></form></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="px-6 py-4 border-t border-gray-100">
            <details>
              <summary className="text-sm text-blue-600 cursor-pointer hover:underline">+ 案件を追加</summary>
              <form action={createDealAction} className="mt-3 space-y-3">
                <input type="hidden" name="company_id" value={companyId} />
                <div className="grid grid-cols-2 gap-3">
                  <input name="title" placeholder="案件名 *" required className="col-span-2 px-3 py-2 border border-gray-300 rounded text-sm" />
                  <label className="text-xs text-gray-500">案件金額（円）<input name="amount" type="number" placeholder="例: 100000" defaultValue="0" className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-sm" /></label>
                  <label className="text-xs text-gray-500">受注確度（%）<input name="probability" type="number" min="0" max="100" placeholder="例: 50" defaultValue="0" className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-sm" /></label>
                  <label className="text-xs text-gray-500">営業ステージ<select name="stage_id" className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-sm">
                    <option value="">営業ステージを選択</option>
                    {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select></label>
                  <label className="text-xs text-gray-500">受注予定日<input name="expected_close_date" type="date" className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-sm" /></label>
                </div>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">追加</button>
              </form>
            </details>
          </div>
        </CardBody>
      </Card>

      <Card><CardHeader><h2 className="font-semibold">課題管理</h2></CardHeader><CardBody>
        <p className="text-sm text-gray-500 mb-3">登録済みの課題：{tasks.length}件</p>
        <Link href={`/tasks?company=${companyId}`} className="text-blue-600 underline">この顧客の課題を管理</Link>
      </CardBody></Card>

      {mailHistory ? <Card>
        <CardHeader><div className="flex items-center justify-between"><h2 className="font-semibold">業務連絡メール</h2><Link href={`/bulk-mail?company=${companyId}`} className="text-sm text-blue-600 hover:underline">メールを作成・履歴を確認</Link></div></CardHeader>
        <CardBody><p className="text-sm mb-3">業務連絡用代表メール：{mailAddress?.email || '未登録'} <Link href={`/bulk-mail?company=${companyId}&view=addresses`} className="text-blue-600 hover:underline ml-3">代表メールを設定</Link></p>{mailHistory.length ? <ul className="space-y-3">{mailHistory.slice(0, 5).map(mail => <li key={mail.id}><Link href={`/bulk-mail?company=${companyId}`} className="text-sm text-blue-600 hover:underline">{mail.subject}</Link><p className="text-xs text-gray-500">{campaignLabels[mail.status]} · {formatDisplayDateTime(mail.updatedAt)} · {mail.review?.filter(r => r.companyId === companyId && !r.exclusion).map(r => r.email).join('、')}</p></li>)}</ul> : <p className="text-sm text-gray-500">業務連絡メールの履歴はありません。</p>}</CardBody>
      </Card> : null}

    </div>
  )
}
