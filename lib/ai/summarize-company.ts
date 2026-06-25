import { formatDisplayDate } from '@/lib/utils/date'
import 'server-only'
import { Company } from '@/lib/db/queries/companies'
import { Activity } from '@/lib/db/queries/activities'
import { Deal } from '@/lib/db/queries/deals'

export async function summarizeCompany(
  company: Company,
  activities: Activity[],
  deals: Deal[]
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')

  const activitiesText = activities
    .slice(0, 10)
    .map((a) => `- [${a.type}] ${formatDisplayDate(a.activity_date)}: ${a.summary}`)
    .join('\n')

  const dealsText = deals
    .map((d) => `- ${d.title}: ¥${Number(d.amount).toLocaleString()} (${d.stage_name ?? '未設定'}, 確度${d.probability}%)`)
    .join('\n')

  const prompt = `以下の顧客情報をもとに、営業担当者向けの簡潔な顧客サマリーを日本語で作成してください。

## 顧客基本情報
会社名: ${company.name}
業種: ${company.industry ?? '不明'}
ステータス: ${company.status}
住所: ${company.address ?? '未入力'}
電話: ${company.phone ?? '未入力'}
ウェブサイト: ${company.website_url ?? '未入力'}
メモ: ${company.memo ?? 'なし'}

## 案件
${dealsText || 'なし'}

## 最近の活動履歴
${activitiesText || 'なし'}

営業観点から重要なポイントを3〜5点にまとめ、次のアクションについても言及してください。`

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
      max_tokens: 800,
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
