import 'server-only'
import { sql } from '@/lib/db'

export interface DashboardData {
  todayTasks: number
  overdueTasks: number
  openDeals: number
  stageStats: Array<{
    stage_name: string
    deal_count: number
    total_amount: number
  }>
}

type Row = Record<string, unknown>

export async function getDashboardData(): Promise<DashboardData> {
  const [todayTasksResult, overdueTasksResult, openDealsResult, stageStatsResult] =
    await Promise.all([
      sql`
        SELECT COUNT(*) as count FROM crm_live_tasks
        WHERE deleted_at IS NULL AND status IN ('open', 'in_progress')
          AND due_date = (now() AT TIME ZONE 'Asia/Tokyo')::date
      `,
      sql`
        SELECT COUNT(*) as count FROM crm_live_tasks
        WHERE deleted_at IS NULL AND status IN ('open', 'in_progress')
          AND due_date < (now() AT TIME ZONE 'Asia/Tokyo')::date
      `,
      sql`
        SELECT COUNT(*) as count FROM crm_live_deals
        WHERE deleted_at IS NULL AND status = 'open'
      `,
      sql`
        SELECT ds.name as stage_name, COUNT(d.id) as deal_count, COALESCE(SUM(d.amount), 0) as total_amount
        FROM deal_stages ds
        LEFT JOIN crm_live_deals d ON d.stage_id = ds.id AND d.deleted_at IS NULL AND d.status = 'open'
        GROUP BY ds.id, ds.name, ds.sort_order
        ORDER BY ds.sort_order
      `,
    ])

  return {
    todayTasks: Number((todayTasksResult[0] as Row).count),
    overdueTasks: Number((overdueTasksResult[0] as Row).count),
    openDeals: Number((openDealsResult[0] as Row).count),
    stageStats: stageStatsResult as unknown as DashboardData['stageStats'],
  }
}
