type Environment = Record<string, string | undefined>

export function localAuthEnabled(env: Environment, host: string | null) {
  if (env.NODE_ENV !== 'development' || env.VERCEL || env.VERCEL_ENV || env.LOCAL_AUTH_ENABLED !== 'true' || !env.LOCAL_AUTH_KEY || env.LOCAL_AUTH_KEY.length > 128 || !host) return false
  try {
    const url = new URL(`http://${host}`)
    return url.host === host && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.pathname === '/' && !url.username && !url.password
  } catch { return false }
}

export function localLoginRequest(env: Environment, host: string | null, origin: string | null, fetchSite: string | null) {
  if (!localAuthEnabled(env, host) || !origin || fetchSite === 'cross-site') return false
  try {
    const url = new URL(origin)
    return ['http:', 'https:'].includes(url.protocol) && url.origin === origin && url.host === host
  } catch { return false }
}
