export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getCompanyById } from '@/lib/db/queries/companies'
import { getContacts } from '@/lib/db/queries/contacts'
import { getDeals, getDealStages } from '@/lib/db/queries/deals'
import { getActivitiesByCompany } from '@/lib/db/queries/activities'
import { getTasksByCompany } from '@/lib/db/queries/tasks'
import { getFilesByCompany } from '@/lib/db/queries/files'
import { getAiSummaries } from '@/lib/db/queries/ai_summaries'
import { Badge, stageBadgeVariant, statusBadgeVariant } from '@/components/ui/Badge'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { createContactAction, deleteContactAction } from '@/lib/actions/contacts'
import { createDealAction, deleteDealAction } from '@/lib/actions/deals'
import { createActivityAction, deleteActivityAction } from '@/lib/actions/activities'
import { createTaskAction, completeTaskAction, deleteTaskAction } from '@/lib/actions/tasks'
import { createFileAction, deleteFileAction } from '@/lib/actions/files'
import { deleteCompanyAction } from '@/lib/actions/companies'
import { DeleteCompanyButton } from './DeleteCompanyButton'
import Link from 'next/link'

function formatDate(value: Date | string | null | undefined) {
  if (!value) return '-'
  return new Date(value).toISOString().slice(0, 10)
}

interface Props {
  params: Promise<{ companyId: string }>
}

const activityTypeLabels: Record<string, string> = {
  call: '電話',
  email: 'メール',
  meeting: 'ミーティング',
  visit: '訪問',
  other: 'その他',
}

const priorityLabels: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

export default async function CompanyDetailPage({ params }: Props) {
  const { companyId } = await params
  const [company, contacts, deals, activities, tasks, files, aiSummaries, stages] = await Promise.all([
    getCompanyById(companyId),
    getContacts(companyId),
    getDeals({ companyId }),
    getActivitiesByCompany(companyId),
    getTasksByCompany(companyId),
    getFilesByCompany(companyId),
    getAiSummaries(companyId),
    getDealStages(),
  ])

  if (!company) notFound()

  const now = new Date()

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

      {/* Activities */}
      <Card>
        <CardHeader><h2 className="font-semibold">活動履歴</h2></CardHeader>
        <CardBody className="p-0">
          {activities.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {activities.map((a) => (
                <li key={a.id} className="px-6 py-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="inline-block text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded mr-2">{activityTypeLabels[a.type] ?? a.type}</span>
                      <span className="text-sm font-medium">{a.summary}</span>
                      {a.body && <p className="text-xs text-gray-500 mt-1">{a.body}</p>}
                      {a.next_action && <p className="text-xs text-blue-600 mt-1">次のアクション: {a.next_action}</p>}
                    </div>
                    <div className="flex items-center gap-2 whitespace-nowrap ml-4"><span className="text-xs text-gray-400">{formatDate(a.activity_date)}</span><Link href={`/activities/${a.id}/edit`} className="text-xs text-blue-600 hover:underline">編集</Link><form action={deleteActivityAction.bind(null, a.id, companyId)}><button type="submit" className="text-xs text-red-500 hover:underline">削除</button></form></div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="px-6 py-4 border-t border-gray-100">
            <details>
              <summary className="text-sm text-blue-600 cursor-pointer hover:underline">+ 活動を記録</summary>
              <form action={createActivityAction} className="mt-3 space-y-3">
                <input type="hidden" name="company_id" value={companyId} />
                <div className="grid grid-cols-2 gap-3">
                  <select name="type" className="px-3 py-2 border border-gray-300 rounded text-sm">
                    <option value="call">電話</option>
                    <option value="email">メール</option>
                    <option value="meeting">ミーティング</option>
                    <option value="visit">訪問</option>
                    <option value="other">その他</option>
                  </select>
                  <input name="activity_date" type="datetime-local" required className="px-3 py-2 border border-gray-300 rounded text-sm" />
                  <input name="summary" placeholder="概要 *" required className="col-span-2 px-3 py-2 border border-gray-300 rounded text-sm" />
                  <textarea name="body" placeholder="詳細" rows={2} className="col-span-2 px-3 py-2 border border-gray-300 rounded text-sm" />
                  <input name="next_action" placeholder="次のアクション" className="col-span-2 px-3 py-2 border border-gray-300 rounded text-sm" />
                </div>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">記録</button>
              </form>
            </details>
          </div>
        </CardBody>
      </Card>

      {/* Tasks */}
      <Card>
        <CardHeader><h2 className="font-semibold">タスク</h2></CardHeader>
        <CardBody className="p-0">
          {tasks.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {tasks.map((t) => {
                const isOverdue = t.due_date && t.status === 'open' && new Date(t.due_date) < now
                return (
                  <li key={t.id} className={`px-6 py-3 ${isOverdue ? 'bg-red-50' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className={`text-sm font-medium ${t.status === 'done' ? 'line-through text-gray-400' : ''} ${isOverdue ? 'text-red-700' : 'text-gray-900'}`}>{t.title}</span>
                        <span className="ml-2 text-xs text-gray-500">[{priorityLabels[t.priority] ?? t.priority}]</span>
                      </div>
                      <div className="flex items-center gap-2"><span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>{formatDate(t.due_date)}</span>{t.status === 'open' && <form action={completeTaskAction.bind(null, t.id)}><button type="submit" className="text-xs text-green-600 hover:underline">完了</button></form>}<Link href={`/tasks/${t.id}/edit`} className="text-xs text-blue-600 hover:underline">編集</Link><form action={deleteTaskAction.bind(null, t.id, companyId)}><button type="submit" className="text-xs text-red-500 hover:underline">削除</button></form></div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="px-6 py-4 border-t border-gray-100">
            <details>
              <summary className="text-sm text-blue-600 cursor-pointer hover:underline">+ タスクを追加</summary>
              <form action={createTaskAction} className="mt-3 space-y-3">
                <input type="hidden" name="company_id" value={companyId} />
                <div className="grid grid-cols-2 gap-3">
                  <input name="title" placeholder="タイトル *" required className="col-span-2 px-3 py-2 border border-gray-300 rounded text-sm" />
                  <input name="due_date" type="date" className="px-3 py-2 border border-gray-300 rounded text-sm" />
                  <select name="priority" className="px-3 py-2 border border-gray-300 rounded text-sm">
                    <option value="high">高</option>
                    <option value="medium">中</option>
                    <option value="low">低</option>
                  </select>
                </div>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">追加</button>
              </form>
            </details>
          </div>
        </CardBody>
      </Card>

      {/* Files */}
      <Card>
        <CardHeader><h2 className="font-semibold">ファイル</h2></CardHeader>
        <CardBody className="p-0">
          {files.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {files.map((f) => (
                <li key={f.id} className="px-6 py-3 flex items-center justify-between">
                  <a href={f.file_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">{f.filename}</a>
                  <div className="flex items-center gap-2"><span className="text-xs text-gray-400">{formatDate(f.created_at)}</span><Link href={`/files/${f.id}/edit`} className="text-xs text-blue-600 hover:underline">編集</Link><form action={deleteFileAction.bind(null, f.id, companyId)}><button type="submit" className="text-xs text-red-500 hover:underline">削除</button></form></div>
                </li>
              ))}
            </ul>
          )}
          <div className="px-6 py-4 border-t border-gray-100">
            <details>
              <summary className="text-sm text-blue-600 cursor-pointer hover:underline">+ ファイルを追加</summary>
              <form action={createFileAction} className="mt-3 space-y-3">
                <input type="hidden" name="company_id" value={companyId} />
                <div className="grid grid-cols-2 gap-3">
                  <input name="filename" placeholder="ファイル名 *" required className="px-3 py-2 border border-gray-300 rounded text-sm" />
                  <input name="file_url" type="url" placeholder="URL *" required className="px-3 py-2 border border-gray-300 rounded text-sm" />
                </div>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">追加</button>
              </form>
            </details>
          </div>
        </CardBody>
      </Card>

      {/* AI Summaries */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">AIサマリー</h2>
            <div className="flex gap-2">
              <a
                href={`/api/ai/summarize-company`}
                data-company-id={companyId}
                className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
              >
                顧客サマリー生成
              </a>
            </div>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {aiSummaries.length === 0 ? (
            <p className="px-6 py-4 text-sm text-gray-500">AIサマリーがありません。上のボタンから生成してください。</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {aiSummaries.map((s) => (
                <li key={s.id} className="px-6 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                      {s.summary_type === 'company_summary' ? '顧客サマリー' : 'ネクストアクション提案'}
                    </span>
                    <span className="text-xs text-gray-400">{s.created_at?.toString().slice(0, 16)}</span>
                  </div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{s.content}</p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
