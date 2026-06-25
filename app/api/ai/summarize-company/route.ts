export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getCompanyById } from '@/lib/db/queries/companies'
import { getActivitiesByCompany } from '@/lib/db/queries/activities'
import { getDeals } from '@/lib/db/queries/deals'
import { summarizeCompany } from '@/lib/ai/summarize-company'
import { createAiSummary } from '@/lib/db/queries/ai_summaries'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { companyId?: string }
    const { companyId } = body

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
    }

    const [company, activities, deals] = await Promise.all([
      getCompanyById(companyId),
      getActivitiesByCompany(companyId),
      getDeals({ companyId }),
    ])

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const content = await summarizeCompany(company, activities, deals)

    await createAiSummary({
      company_id: companyId,
      summary_type: 'company_summary',
      content,
    })

    return NextResponse.json({ content })
  } catch (err) {
    console.error('summarize-company error:', err)
    return NextResponse.json({ error: 'AIサマリーの生成に失敗しました' }, { status: 500 })
  }
}
