import 'server-only'
import { getSql } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth/session'
import { BillingRepository } from './repository'
import { createInvoicePdf } from './pdf'

export function repository() {
  return new BillingRepository(
    {
      query: (text, params) => getSql().query(text, params),
    },
    process.env.BILLING_ALLOW_REAL_RECIPIENTS === 'true',
  )
}
export function sendOptions() {
  return {
    live:
      process.env.VERCEL_ENV === 'production' &&
      process.env.BILLING_LIVE_SEND_ENABLED === 'true' &&
      process.env.BILLING_ALLOW_REAL_RECIPIENTS === 'true',
    apiKey: process.env.RESEND_API_KEY,
    pdf: createInvoicePdf,
  }
}
export async function billingUser() {
  const user = await getCurrentUser()
  return user?.is_active && user.role === 'admin' ? user : null
}
