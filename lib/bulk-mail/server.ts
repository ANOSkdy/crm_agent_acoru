import 'server-only'
import { relative, resolve, sep } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { getSql } from '@/lib/db'
import { requireApiUser } from '@/lib/auth/deal-permissions'
import { assertMailAdmin, isLocalMailEnabled, isMailEnabled, isProductionMailEnabled, MailError } from './domain'
import { MailRepository, type MailDb, type QueryDb } from './repository'
import { localSchema } from './schema'
import { drainMail } from './worker'
import { postgresMailDb } from './postgres'

type LocalRuntime = { repo?: Promise<MailRepository>; timer?: ReturnType<typeof setInterval>; draining?: Promise<void> }
const local = globalThis as typeof globalThis & { acoruLocalMail?: LocalRuntime }
const state = local.acoruLocalMail ??= {}

export function localMailEnabled() { return isLocalMailEnabled(process.env) }
export function mailEnabled() { return isMailEnabled(process.env) }
export async function mailUser() {
  const user = await requireApiUser()
  assertMailAdmin(user)
  if (!mailEnabled()) throw new MailError('一斉メールは停止中です', 403)
  return user
}
export async function mailRepository() {
  if (!mailEnabled()) throw new MailError('一斉メールは停止中です', 403)
  if (isProductionMailEnabled(process.env)) {
    const crm: QueryDb = { query: (q, p) => getSql().query(q, p) }
    return new MailRepository(postgresMailDb(crm, process.env.DATABASE_URL!), crm, {
      deliveryMode: process.env.BULK_MAIL_LIVE_SEND_ENABLED === 'true' ? 'live' : 'simulation',
      from: process.env.BULK_MAIL_FROM?.trim(),
    })
  }
  if (!state.repo) {
    state.repo = (async () => {
      const storeName = process.env.BULK_MAIL_STORE_NAME ?? 'db'
      if (!/^[a-z0-9-]{1,80}$/.test(storeName)) throw new MailError('ローカル保存先の名前が不正です')
      // Writable state comes from runtime configuration, never build-time file assets.
      const directory = process.env.BULK_MAIL_LOCAL_DIR
      if (!directory) throw new MailError('npm run dev:mail でローカル試用を起動してください')
      if (relative(process.cwd(), resolve(directory)).split(sep).join('/') !== '.local-test/bulk-mail') throw new MailError('ローカル保存先は作業フォルダ内に限定されています')
      const path = resolve(directory, storeName)
      await mkdir(path, { recursive: true })
      const store = new PGlite(path)
      await store.exec(localSchema)
      // A local simulation interrupted by a server restart never sent real mail.
      await store.query("UPDATE mail_deliveries SET status='failed',result='サーバー再起動で模擬処理が中断しました' WHERE status='sending'")
      const adapt = (db: Pick<PGlite, 'query'>): QueryDb => ({ query: async (q, p) => (await db.query(q, p)).rows as Record<string, unknown>[] })
      const db: MailDb = { ...adapt(store), transaction: fn => store.transaction(tx => fn(adapt(tx))) }
      return new MailRepository(db, { query: (q, p) => getSql().query(q, p) })
    })().catch(error => { state.repo = undefined; throw error })
  }
  return state.repo
}
export async function runLocalMailWorker() {
  if (!localMailEnabled() || state.draining) return
  state.draining = (async () => {
    const repo = await mailRepository()
    const [pending] = await repo.db.query("SELECT id FROM mail_campaigns WHERE status IN ('queued','running') LIMIT 1")
    if (pending) await drainMail(repo)
  })().catch(() => { console.error('Local mail simulation could not progress; saved jobs will be resumed.') }).finally(() => { state.draining = undefined })
  await state.draining
}
export async function startLocalMailWorker() {
  if (!localMailEnabled() || state.timer) return
  await mailRepository()
  state.timer = setInterval(() => { void runLocalMailWorker() }, 1000)
  state.timer.unref()
  void runLocalMailWorker()
}
