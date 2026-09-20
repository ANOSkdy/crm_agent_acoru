export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getCompanyById } from '@/lib/db/queries/companies'
import { getActivitiesByCompany } from '@/lib/db/queries/activities'
import { getDeals } from '@/lib/db/queries/deals'
import { summarizeCompany } from '@/lib/ai/summarize-company'
import { createAiSummary } from '@/lib/db/queries/ai_summaries'
import { requireApiUser } from '@/lib/auth/deal-permissions'
import { apiError, checkMutationRequest, readBody } from '@/lib/agent/http'
import { z } from 'zod'

export async function POST(req: NextRequest) {
  try {
    checkMutationRequest(req)
    await requireApiUser()
    const body = z.object({ companyId: z.string().uuid() }).parse(await readBody(req))
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
    return apiError(err)
  }
}
