import { formatDisplayDate } from '@/lib/utils/date'
import 'server-only'
import { Company } from '@/lib/db/queries/companies'
import { Deal } from '@/lib/db/queries/deals'
import { Activity } from '@/lib/db/queries/activities'

export async function suggestNextActions(
  company: Company,
  activities: Activity[],
  deal?: Deal
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')

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

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 600,
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`)
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>
  }
  return data.choices[0].message.content
}
