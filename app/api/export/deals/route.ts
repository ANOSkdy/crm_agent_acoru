import { NextResponse } from 'next/server'
import { getDeals } from '@/lib/db/queries/deals'

export async function GET() {
  try {
    const deals = await getDeals()

    const headers = ['ID', '案件名', '会社名', '営業ステージ', '案件金額（円）', '受注確度（%）', '確度加重見込み金額（円）', '受注予定日', 'ステータス', '作成日']
    const rows = deals.map((d) => {
      const amount = Number(d.amount)
      const weighted = Math.round(amount * d.probability / 100)
      return [
        d.id,
        d.title,
        d.company_name ?? '',
        d.stage_name ?? '',
        amount,
        d.probability,
        weighted,
        d.expected_close_date ?? '',
        d.status,
        d.created_at?.toString().slice(0, 10) ?? '',
      ]
    })

    const csv = [headers, ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const bom = '﻿'
    return new NextResponse(bom + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="deals.csv"',
      },
    })
  } catch (err) {
    console.error('export deals error:', err)
    return NextResponse.json({ error: 'エクスポートに失敗しました' }, { status: 500 })
  }
}
