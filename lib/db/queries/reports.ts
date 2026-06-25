import 'server-only'
import { sql } from '@/lib/db'

export interface ReportsData {
  stageStats: Array<{
    stage_name: string
    deal_count: number
    total_amount: number
    weighted_amount: number
  }>
  thisMonthClose: number
  nextMonthClose: number
  weightedForecast: number
  overdueTaskCount: number
  recentActivityCount: number
}

type Row = Record<string, unknown>

export async function getReportsData(): Promise<ReportsData> {
  const [stageStatsResult, thisMonthResult, nextMonthResult, weightedResult, overdueResult, activityResult] =
    await Promise.all([
      sql`
        SELECT ds.name as stage_name,
               COUNT(d.id) as deal_count,
               COALESCE(SUM(d.amount), 0) as total_amount,
               COALESCE(SUM(d.amount * d.probability / 100), 0) as weighted_amount
        FROM deal_stages ds
        LEFT JOIN deals d ON d.stage_id = ds.id AND d.deleted_at IS NULL AND d.status = 'open'
        GROUP BY ds.id, ds.name, ds.sort_order
        ORDER BY ds.sort_order
      `,
      sql`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM deals
        WHERE deleted_at IS NULL AND status = 'open'
          AND DATE_TRUNC('month', expected_close_date) = DATE_TRUNC('month', CURRENT_DATE)
      `,
      sql`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM deals
        WHERE deleted_at IS NULL AND status = 'open'
          AND DATE_TRUNC('month', expected_close_date) = DATE_TRUNC('month', CURRENT_DATE + INTERVAL '1 month')
      `,
      sql`
        SELECT COALESCE(SUM(amount * probability / 100), 0) as total
        FROM deals
        WHERE deleted_at IS NULL AND status = 'open'
      `,
      sql`
        SELECT COUNT(*) as count FROM tasks
        WHERE deleted_at IS NULL AND status = 'open' AND due_date < CURRENT_DATE
      `,
      sql`
        SELECT COUNT(*) as count FROM activities
        WHERE deleted_at IS NULL
          AND activity_date >= CURRENT_DATE - INTERVAL '30 days'
      `,
    ])

  return {
    stageStats: stageStatsResult as unknown as ReportsData['stageStats'],
    thisMonthClose: Number((thisMonthResult[0] as Row).total),
    nextMonthClose: Number((nextMonthResult[0] as Row).total),
    weightedForecast: Number((weightedResult[0] as Row).total),
    overdueTaskCount: Number((overdueResult[0] as Row).count),
    recentActivityCount: Number((activityResult[0] as Row).count),
  }
}
