export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getCompanyById } from '@/lib/db/queries/companies'
import { getActivities } from '@/lib/db/queries/activities'
import { getDealById } from '@/lib/db/queries/deals'
import { suggestNextActions } from '@/lib/ai/suggest-next-actions'
import { createAiSummary } from '@/lib/db/queries/ai_summaries'
import { requireApiUser } from '@/lib/auth/deal-permissions'
import { apiError, checkMutationRequest, readBody } from '@/lib/agent/http'
import { z } from 'zod'

export async function POST(req: NextRequest) {
  try {
    checkMutationRequest(req)
    await requireApiUser()
    const body = z.object({ companyId: z.string().uuid(), dealId: z.string().uuid().optional() }).parse(await readBody(req))
    const { companyId, dealId } = body

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
    }

    const [company, activities, deal] = await Promise.all([
      getCompanyById(companyId),
      getActivities(dealId ? { dealId } : { companyId }),
      dealId ? getDealById(dealId) : Promise.resolve(null),
    ])

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }
    if (dealId && (!deal || deal.company_id !== companyId)) return NextResponse.json({ error: '案件と顧客の対応が不正です' }, { status: 400 })

    const content = await suggestNextActions(company, activities, deal ?? undefined)

    await createAiSummary({
      company_id: companyId,
      deal_id: dealId,
      summary_type: 'next_actions',
      content,
    })

    return NextResponse.json({ content })
  } catch (err) {
    return apiError(err)
  }
}
