import { timingSafeEqual } from 'node:crypto'
import { repository, sendOptions } from '@/lib/billing/server'
import { scheduledRun } from '@/lib/billing/service'

export const runtime = 'nodejs'
export const maxDuration = 300
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const supplied = Buffer.from(request.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  if (
    !secret ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return new Response('Unauthorized', { status: 401 })
  try {
    return Response.json(await scheduledRun(repository(), sendOptions()))
  } catch {
    return Response.json({ error: 'billing_job_failed' }, { status: 500 })
  }
}
