import 'server-only'
import { sql } from '@/lib/db'

export interface DashboardData {
  todayTasks: number
  overdueTasks: number
  openDeals: number
  recentActivities: Array<{
    id: string
    summary: string
    type: string
    activity_date: string
    company_name: string | null
  }>
  stageStats: Array<{
    stage_name: string
    deal_count: number
    total_amount: number
  }>
}

type Row = Record<string, unknown>

export async function getDashboardData(): Promise<DashboardData> {
  const [todayTasksResult, overdueTasksResult, openDealsResult, recentActivitiesResult, stageStatsResult] =
    await Promise.all([
      sql`
        SELECT COUNT(*) as count FROM tasks
        WHERE deleted_at IS NULL AND status = 'open'
          AND due_date = CURRENT_DATE
      `,
      sql`
        SELECT COUNT(*) as count FROM tasks
        WHERE deleted_at IS NULL AND status = 'open'
          AND due_date < CURRENT_DATE
      `,
      sql`
        SELECT COUNT(*) as count FROM deals
        WHERE deleted_at IS NULL AND status = 'open'
      `,
      sql`
        SELECT a.id, a.summary, a.type, a.activity_date, co.name as company_name
        FROM activities a
        LEFT JOIN companies co ON co.id = a.company_id
        WHERE a.deleted_at IS NULL
        ORDER BY a.activity_date DESC
        LIMIT 5
      `,
      sql`
        SELECT ds.name as stage_name, COUNT(d.id) as deal_count, COALESCE(SUM(d.amount), 0) as total_amount
        FROM deal_stages ds
        LEFT JOIN deals d ON d.stage_id = ds.id AND d.deleted_at IS NULL AND d.status = 'open'
        GROUP BY ds.id, ds.name, ds.sort_order
        ORDER BY ds.sort_order
      `,
    ])

  return {
    todayTasks: Number((todayTasksResult[0] as Row).count),
    overdueTasks: Number((overdueTasksResult[0] as Row).count),
    openDeals: Number((openDealsResult[0] as Row).count),
    recentActivities: recentActivitiesResult as unknown as DashboardData['recentActivities'],
    stageStats: stageStatsResult as unknown as DashboardData['stageStats'],
  }
}
