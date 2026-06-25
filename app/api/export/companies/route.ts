import { NextResponse } from 'next/server'
import { getCompanies } from '@/lib/db/queries/companies'

export async function GET() {
  try {
    const companies = await getCompanies()

    const headers = ['ID', '会社名', '法人番号', '業種', 'ウェブサイト', '郵便番号', '住所', '電話番号', 'ステータス', '流入元', 'メモ', '作成日']
    const rows = companies.map((c) => [
      c.id,
      c.name,
      c.corporate_number ?? '',
      c.industry ?? '',
      c.website_url ?? '',
      c.postal_code ?? '',
      c.address ?? '',
      c.phone ?? '',
      c.status,
      c.source ?? '',
      (c.memo ?? '').replace(/,/g, '、').replace(/\n/g, ' '),
      c.created_at?.toString().slice(0, 10) ?? '',
    ])

    const csv = [headers, ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const bom = '﻿'
    return new NextResponse(bom + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="companies.csv"',
      },
    })
  } catch (err) {
    console.error('export companies error:', err)
    return NextResponse.json({ error: 'エクスポートに失敗しました' }, { status: 500 })
  }
}
