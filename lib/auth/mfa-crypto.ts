import 'server-only'
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto'
import { Secret, TOTP } from 'otpauth'

export type AuthEnvironment = 'local' | 'preview' | 'production'
export const MFA_COOKIE = 'acoru_mfa_challenge'
export const CHALLENGE_SECONDS = 5 * 60
export const SESSION_SECONDS = 8 * 60 * 60

export function otpUserId(value = process.env.OTP_USER_ID) {
  if (
    !value ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw Error('OTP user configuration unavailable')
  return value
}

export function authEnvironment(): AuthEnvironment {
  if (process.env.VERCEL_ENV === 'production') return 'production'
  if (process.env.VERCEL_ENV === 'preview') return 'preview'
  return 'local'
}

export function encryptionKey(value = process.env.MFA_ENCRYPTION_KEY): Buffer {
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value))
    throw Error('MFA configuration unavailable')
  const key = Buffer.from(value, 'base64')
  if (key.length !== 32 || key.toString('base64') !== value)
    throw Error('MFA configuration unavailable')
  return key
}

export function tokenHash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function newSecret() {
  return Secret.fromHex(randomBytes(20).toString('hex')).base32
}

export function encryptSecret(
  secret: string,
  context: string,
  key = encryptionKey(),
) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(context))
  const ciphertext = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ])
  return [iv, cipher.getAuthTag(), ciphertext]
    .map((part) => part.toString('base64url'))
    .join('.')
}

export function decryptSecret(
  value: string,
  context: string,
  key = encryptionKey(),
) {
  const parts = value.split('.')
  if (parts.length !== 3) throw Error('Invalid credential')
  const [iv, tag, ciphertext] = parts.map((part) =>
    Buffer.from(part, 'base64url'),
  )
  if (iv.length !== 12 || tag.length !== 16) throw Error('Invalid credential')
  const cipher = createDecipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(context))
  cipher.setAuthTag(tag)
  const secret = Buffer.concat([
    cipher.update(ciphertext),
    cipher.final(),
  ]).toString('utf8')
  if (!/^[A-Z2-7]{32}$/.test(secret)) throw Error('Invalid credential')
  return secret
}

export function authenticator(secret: string, label: string) {
  return new TOTP({
    issuer: 'Acoru CRM',
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  })
}

export function verifyCode(
  secret: string,
  code: unknown,
  timestamp = Date.now(),
) {
  if (typeof code !== 'string' || !/^[0-9]{6}$/.test(code)) return null
  const delta = authenticator(secret, '').validate({
    token: code,
    timestamp,
    window: 1,
  })
  return delta === null ? null : Math.floor(timestamp / 30_000) + delta
}

export function safeReturnTo(value: unknown) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\x00-\x20]/.test(value)
  )
    return '/dashboard'
  return value.startsWith('/login') ? '/dashboard' : value
}
