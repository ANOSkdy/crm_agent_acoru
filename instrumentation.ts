export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.BULK_MAIL_LOCAL_ENABLED === 'true' && !process.env.VERCEL && !process.env.VERCEL_ENV) {
    const { startLocalMailWorker } = await import('./lib/bulk-mail/server')
    await startLocalMailWorker()
  }
}
