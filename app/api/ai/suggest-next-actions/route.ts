export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getCompanyById } from '@/lib/db/queries/companies'
import { getActivitiesByCompany } from '@/lib/db/queries/activities'
import { getDealById } from '@/lib/db/queries/deals'
import { suggestNextActions } from '@/lib/ai/suggest-next-actions'
import { createAiSummary } from '@/lib/db/queries/ai_summaries'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { companyId?: string; dealId?: string }
    const { companyId, dealId } = body

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
    }

    const [company, activities, deal] = await Promise.all([
      getCompanyById(companyId),
      getActivitiesByCompany(companyId),
      dealId ? getDealById(dealId) : Promise.resolve(null),
    ])

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const content = await suggestNextActions(company, activities, deal ?? undefined)

    await createAiSummary({
      company_id: companyId,
      deal_id: dealId,
      summary_type: 'next_actions',
      content,
    })

    return NextResponse.json({ content })
  } catch (err) {
    console.error('suggest-next-actions error:', err)
    return NextResponse.json({ error: 'AI提案の生成に失敗しました' }, { status: 500 })
  }
}
