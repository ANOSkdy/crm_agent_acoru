export const dynamic = 'force-dynamic'

import { getDashboardData } from '@/lib/db/queries/dashboard'
import Link from 'next/link'

export default async function DashboardPage() {
  const data = await getDashboardData()
  const pipelineTotal = data.stageStats.reduce((sum, s) => sum + Number(s.total_amount), 0)

  return (
    <div className="workspace">
      <div className="workspace__bar">
        <h1 className="workspace__title">ダッシュボード</h1>
        <span className="workspace__meta">今日の状況</span>
      </div>
      <div className="workspace__body workspace__body--padded">
        <div className="dashboard">
          <div className="kpi-strip">
            <div className="kpi">
              <span className="kpi__label">本日の課題</span>
              <span className="kpi__value">{data.todayTasks}</span>
              <Link href="/tasks" className="kpi__link">課題一覧 →</Link>
            </div>
            <div className="kpi">
              <span className="kpi__label">期限切れ課題</span>
              <span className={`kpi__value${data.overdueTasks > 0 ? ' kpi__value--danger' : ''}`}>{data.overdueTasks}</span>
              <Link href="/tasks" className="kpi__link">確認する →</Link>
            </div>
            <div className="kpi">
              <span className="kpi__label">進行中の案件</span>
              <span className="kpi__value">{data.openDeals}</span>
              <Link href="/deals?status=open" className="kpi__link">案件一覧 →</Link>
            </div>
            <div className="kpi">
              <span className="kpi__label">パイプライン金額</span>
              <span className="kpi__value">¥{pipelineTotal.toLocaleString()}</span>
              <span className="kpi__note">全ステージ合計</span>
            </div>
          </div>

          <section className="panel">
            <div className="panel__head"><h2 className="panel__title">パイプライン</h2></div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>営業ステージ</th>
                  <th className="num">案件件数</th>
                  <th className="num">案件金額合計（円）</th>
                  <th>構成比</th>
                </tr>
              </thead>
              <tbody>
                {data.stageStats.map((s) => {
                  const share = pipelineTotal > 0 ? Number(s.total_amount) / pipelineTotal : 0
                  return (
                    <tr key={s.stage_name}>
                      <td>{s.stage_name}</td>
                      <td className="num">{Number(s.deal_count)}</td>
                      <td className="num">¥{Number(s.total_amount).toLocaleString()}</td>
                      <td><span className="share-bar"><span style={{ width: `${Math.round(share * 100)}%` }} /></span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  )
}
