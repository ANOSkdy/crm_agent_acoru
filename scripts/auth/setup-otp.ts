import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { mkdir, writeFile } from 'node:fs/promises'
import QRCode from 'qrcode'
import {
  authenticator,
  encryptSecret,
  encryptionKey,
  newSecret,
  otpUserId,
} from '../../lib/auth/mfa-crypto'

config({ path: '.env.local', quiet: true })
const environment = process.argv[2]
if (!['local', 'preview', 'production'].includes(environment))
  throw Error('Usage: setup-otp.ts <local|preview|production>')
const userId = otpUserId(),
  key = encryptionKey()
if (!process.env.DATABASE_URL) throw Error('Missing database')
const sql = neon(process.env.DATABASE_URL)
async function setup() {
  const users =
    await sql`SELECT id FROM users WHERE id=${userId} AND is_active=true AND role='admin'`
  if (users.length !== 1)
    throw Error('Configured active administrator was not found')
  const secret = newSecret(),
    encrypted = encryptSecret(secret, `${environment}:${userId}`, key)
  const qr = await QRCode.toDataURL(
    authenticator(secret, `Admin (${environment})`).toString(),
  )
  const output = `.local-test/otp-enrollment-${environment}.html`
  await mkdir('.local-test', { recursive: true })
  // Never overwrite an existing credential or enrollment artifact.
  const existing =
    await sql`SELECT 1 FROM auth_mfa_credentials WHERE user_id=${userId} AND environment=${environment}`
  if (existing.length)
    throw Error(
      'OTP already exists; use the existing 1Password entry or the documented operator reset',
    )
  await writeFile(
    output,
    `<!doctype html><html lang="ja"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>CRM OTP初期登録</title><body style="font:16px system-ui;max-width:600px;margin:40px auto"><h1>CRM OTP初期登録</h1><p>${environment}環境。1PasswordのワンタイムパスワードにQRを登録してください。</p><img src="${qr}" alt="初期登録QR"><p>手動登録キー</p><code>${secret}</code><p>ログインを確認後、このローカルファイルを削除してください。通常のログイン画面にQRは表示されません。</p></body></html>`,
    { flag: 'wx', mode: 0o600 },
  )
  const inserted =
    await sql`INSERT INTO auth_mfa_credentials(user_id,environment,secret_encrypted) VALUES (${userId},${environment},${encrypted}) ON CONFLICT DO NOTHING RETURNING user_id`
  if (inserted.length !== 1)
    throw Error(
      'Concurrent setup detected; do not use the generated enrollment file',
    )
  console.log(
    `Created private enrollment file: ${output}. Secret values were not printed.`,
  )
}
setup().catch(() => {
  console.error(
    'OTP setup did not complete. Check configuration and existing enrollment; no secrets printed.',
  )
  process.exitCode = 1
})
