// Operator-only, read-only Production build checks. No credentials or records are logged.
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import { decryptSecret, otpUserId } from '../../lib/auth/mfa-crypto'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
let stage = 'environment'
async function check() {
  if (process.env.VERCEL_ENV !== 'production') throw Error('Production required')
  const url = process.env.DATABASE_URL
  if (!url || hash(new URL(url).hostname.replace('-pooler', '')) !== process.env.AUTH_EXPECTED_DATABASE_HOST_HASH)
    throw Error('Production database mismatch')
  const db = neon(url), user = otpUserId()
  stage = 'database-and-views'
  const [credentials, migrations] = await db.transaction([
    db.query(`SELECT c.secret_encrypted FROM auth_mfa_credentials c JOIN users u ON u.id=c.user_id
      WHERE c.user_id=$1 AND c.environment='production' AND c.confirmed_at IS NOT NULL AND u.is_active AND u.role='admin'`, [user]),
    db.query('SELECT name,checksum FROM schema_migrations ORDER BY name'),
    db.query('SELECT * FROM crm_live_deals LIMIT 0'),
    db.query('SELECT * FROM crm_live_tasks LIMIT 0'),
    db.query('SELECT * FROM crm_live_activities LIMIT 0'),
    db.query('SELECT * FROM confirmed_work_logs LIMIT 0'),
  ], { readOnly: true })
  stage = 'existing-otp-registration'
  if (credentials.length !== 1 || hash(credentials[0].secret_encrypted) !== process.env.AUTH_EXPECTED_CREDENTIAL_HASH)
    throw Error('Existing OTP registration mismatch')
  stage = 'existing-otp-key'
  decryptSecret(credentials[0].secret_encrypted, `production:${user}`)
  const files = [{ name: '000_base', path: 'scripts/db/migrate.sql' },
    ...readdirSync('scripts/db/migrations').filter(name => name.endsWith('.sql')).map(name => ({ name, path: `scripts/db/migrations/${name}` }))]
  stage = 'schema-checksums'
  for (const file of files) {
    const applied = migrations.find(row => row.name === file.name)
    if (!applied || applied.checksum !== hash(readFileSync(file.path, 'utf8').replace(/\r\n/g, '\n')))
      throw Error('Schema migration not ready')
  }
  stage = 'raw-flags'
  for (const key of ['RAW_INGEST_ENABLED', 'RAW_EXTRACTION_ENABLED', 'RAW_APPLY_ENABLED', 'RAW_SYNC_ENABLED'])
    if (process.env[key] !== 'true') throw Error('Assistant extension is not enabled')
  stage = 'ai-configuration'
  const aiBase = new URL(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com')
  if (aiBase.protocol !== 'https:' || aiBase.hostname !== 'api.deepseek.com' || !process.env.DEEPSEEK_API_KEY)
    throw Error('AI configuration unavailable')
  stage = 'ai-connection'
  const models = await fetch(`${aiBase.toString().replace(/\/$/, '')}/models`, {
    headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` }, signal: AbortSignal.timeout(15000),
  })
  if (!models.ok) throw Error('AI connection unavailable')
  const data = await models.json() as { data?: { id: string }[] }
  stage = 'ai-model'
  if (!data.data?.some(model => model.id === (process.env.DEEPSEEK_MODEL || 'deepseek-flash')))
    throw Error('Configured AI model unavailable')
  console.log('PASS: Production DB identity, all migration checksums/views, existing OTP registration/key, RAW flags, AI connection/model.')
}
check().catch(() => {
  console.error(`Production release preflight failed at ${stage}. No secrets or business records printed.`)
  process.exitCode = 1
})
