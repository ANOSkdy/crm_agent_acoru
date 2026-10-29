// Read-only deployment check. Never prints credentials or sends mail.
const domain = process.argv[2]
const report = {
  production: process.env.VERCEL_ENV === 'production',
  allowRealRecipients: process.env.BILLING_ALLOW_REAL_RECIPIENTS === 'true',
  liveSendEnabled: process.env.BILLING_LIVE_SEND_ENABLED === 'true',
  resendKeyConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
  cronSecretConfigured: Boolean(process.env.CRON_SECRET?.trim()),
  providerReadStatus: 'not_checked',
  providerErrorType: null,
  senderDomainVerified: null,
}
if (report.resendKeyConfigured && domain) {
  try {
    let cursor
    do {
      const url = new URL('https://api.resend.com/domains')
      url.searchParams.set('limit', '100')
      if (cursor) url.searchParams.set('after', cursor)
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
        signal: AbortSignal.timeout(10000),
      })
      report.providerReadStatus = String(response.status)
      if (!response.ok) {
        const error = await response.json()
        report.providerErrorType = typeof error.name === 'string' && /^[a-z_]{1,50}$/.test(error.name)
          ? error.name : 'unknown'
        break
      }
      const result = await response.json()
      const match = result.data?.find((item) => item.name === domain)
      if (match) {
        report.senderDomainVerified = match.status === 'verified' && match.capabilities?.sending !== 'disabled'
        break
      }
      if (!result.has_more) {
        report.senderDomainVerified = false
        break
      }
      cursor = result.data?.at(-1)?.id
    } while (cursor)
  } catch {
    report.providerReadStatus = 'unavailable'
  }
}
console.log('[billing-config]', JSON.stringify(report))
