import { formatDisplayDate } from '@/lib/utils/date'
import 'server-only'
import { deepseekText } from './deepseek'
import { Company } from '@/lib/db/queries/companies'
import { Deal } from '@/lib/db/queries/deals'
import { Activity } from '@/lib/db/queries/activities'

export async function suggestNextActions(
  company: Company,
  activities: Activity[],
  deal?: Deal
): Promise<string> {
  const activitiesText = activities
    .slice(0, 5)
    .map((a) => `- [${a.type}] ${formatDisplayDate(a.activity_date)}: ${a.summary}`)
    .join('\n')

  const dealText = deal
    ? `案件名: ${deal.title}\n金額: ¥${Number(deal.amount).toLocaleString()}\nステージ: ${deal.stage_name ?? '未設定'}\n確度: ${deal.probability}%\nクローズ予定: ${formatDisplayDate(deal.expected_close_date)}`
    : '案件情報なし'

  const prompt = `営業担当者として、以下の顧客・案件情報をもとに、次に取るべき具体的なアクションを3〜5個提案してください。

## 顧客
会社名: ${company.name}
業種: ${company.industry ?? '不明'}

## 案件情報
${dealText}

## 最近の活動
${activitiesText || 'なし'}

各アクションは具体的で実行可能なものにし、優先度順に並べてください。`

  return deepseekText(prompt)
}
