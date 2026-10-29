import { z } from 'zod'
export const activityTypes = ['call', 'email', 'meeting', 'visit', 'proposal', 'estimate', 'contract', 'support', 'note', 'other'] as const
export const activityTypeSchema = z.enum(activityTypes)
export const activityTypeLabels: Record<typeof activityTypes[number], string> = {
  call: '電話', email: 'メール', meeting: '会議', visit: '訪問', proposal: '提案', estimate: '見積', contract: '契約', support: 'サポート', note: 'メモ', other: 'その他',
}
