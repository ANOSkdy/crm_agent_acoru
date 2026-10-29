import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const LOCAL_SESSION_COOKIE = 'acoru_local_session'
export const LOCAL_SESSION_SECONDS = 8 * 60 * 60
const digest = (s: string) => createHash('sha256').update(s).digest()

export function matchesLocalKey(value: unknown, expected: string) {
  return typeof value === 'string' && value.length <= 128 && expected.length > 0 && timingSafeEqual(digest(value), digest(expected))
}

export class LocalAuthSessions {
  private sessions = new Map<string, { userId: string; expiresAt: number; keyHash: string }>()
  private attempts = { count: 0, until: 0 }
  constructor(private now: () => number = Date.now) {}
  private hash(value: string) { return digest(value).toString('hex') }
  private sweep() {
    for (const [hash, session] of this.sessions) if (session.expiresAt <= this.now()) this.sessions.delete(hash)
  }
  attempt() {
    if (this.attempts.until <= this.now()) this.attempts = { count: 0, until: this.now() + 300000 }
    return ++this.attempts.count <= 10
  }
  create(userId: string, key: string) {
    this.sweep()
    const token = randomBytes(32).toString('base64url')
    this.sessions.set(this.hash(token), { userId, expiresAt: this.now() + LOCAL_SESSION_SECONDS * 1000, keyHash: this.hash(key) })
    this.attempts.count = 0
    return token
  }
  userId(token: string, key: string): string | null {
    if (!/^[\w-]{43}$/.test(token)) return null
    this.sweep()
    const session = this.sessions.get(this.hash(token))
    return session && session.keyHash === this.hash(key) ? session.userId : null
  }
  revoke(token: string) { this.sessions.delete(this.hash(token)) }
}
