import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { assertMailAdmin, draftSchema, isLocalMailEnabled, isMailEnabled, isMailError, renderMail, signature } from '../lib/bulk-mail/domain'
import { MailRepository, type MailDb, type QueryDb } from '../lib/bulk-mail/repository'
import { localSchema } from '../lib/bulk-mail/schema'
import { drainMail } from '../lib/bulk-mail/worker'
import { assertTestHost, manualTestSettings, ManualTestMail, testContentSchema } from '../lib/bulk-mail/manual-test'
import { assertLiveMail, sendCampaign } from '../lib/bulk-mail/live-send'

const adapt = (s: Pick<PGlite, 'query'>): QueryDb => ({ query: async (q, p) => (await s.query(q, p)).rows as Record<string, unknown>[] })
async function setup(register = true) {
  const store = new PGlite()
  await store.exec(`CREATE TABLE companies(id uuid PRIMARY KEY,name text,industry text,status text,deleted_at timestamptz);
    CREATE TABLE contacts(id uuid PRIMARY KEY,company_id uuid,name text,email text,deleted_at timestamptz);
    CREATE TABLE deal_stages(id uuid PRIMARY KEY,is_won boolean);
    CREATE TABLE deals(id uuid PRIMARY KEY,company_id uuid,status text,stage_id uuid,deleted_at timestamptz);
    CREATE SCHEMA billing; CREATE TABLE billing.customers(company_id uuid PRIMARY KEY,email text);`)
  await store.exec(localSchema)
  const db: MailDb = { ...adapt(store), transaction: fn => store.transaction(tx => fn(adapt(tx))) }
  const sourceReads: string[] = []
  const repo = new MailRepository(db, { query: (q, p) => { assert.match(q, /^\s*SELECT\b/i); sourceReads.push(q); return db.query(q, p) } })
  const actor = { id: randomUUID(), name: '検証管理者', email: 'admin@example.invalid' }
  const company = randomUUID(), second = randomUUID(), duplicate = randomUUID(), missing = randomUUID(), other = randomUUID()
  for (const [id, name] of [[company, '契約顧客'], [second, '連絡先ゼロの顧客'], [duplicate, '同一アドレス顧客'], [missing, '代表メール未登録顧客'], [other, '未契約顧客']]) {
    await db.query("INSERT INTO companies VALUES($1,$2,'IT','active',NULL)", [id, name])
    if (id !== other) await db.query("INSERT INTO deals VALUES($1,$2,'won',NULL,NULL)", [randomUUID(), id])
  }
  await db.query("INSERT INTO contacts VALUES($1,$2,'担当者','contact@example.invalid',NULL)", [randomUUID(), company])
  await db.query("INSERT INTO billing.customers VALUES($1,'billing@example.invalid')", [company])
  if (register) {
    for (const [companyId, email] of [[company, 'office@example.invalid'], [second, 'info@example.invalid'], [duplicate, 'OFFICE@example.invalid'], [other, 'other@example.invalid']]) await repo.saveAddress({ companyId, email, version: 0 }, actor)
  }
  const input = { subject: '{{会社名}}へのご連絡', body: '{{会社名}}\nご担当者様\nお知らせです。', companyIds: [company, second] }
  return { store, db, repo, actor, company, second, duplicate, missing, other, input, sourceReads }
}
async function prepared(f: Awaited<ReturnType<typeof setup>>) {
  const c = await f.repo.save(f.input, f.actor)
  await f.repo.test(c.id, c.version, f.actor)
  return f.repo.review(c.id, c.version, f.actor)
}

const testEnv = { NODE_ENV: 'development', BULK_MAIL_LOCAL_ENABLED: 'true', BULK_MAIL_TEST_ENABLED: 'true', BULK_MAIL_TEST_TO: 'test-recipient@example.invalid', BULK_MAIL_TEST_FROM: 'sender@example.invalid', BULK_MAIL_TEST_API_KEY: 'fixture-key-not-real' }
const testContent = { subject: '表示確認', body: 'これは手動テスト用の本文です。' }
const productionEnv = { VERCEL_ENV: 'production', NODE_ENV: 'production', BULK_MAIL_ENABLED: 'true', BULK_MAIL_LIVE_SEND_ENABLED: 'true', BULK_MAIL_FROM: 'sender@example.invalid', RESEND_API_KEY: 'fake-production-test-key', BULK_MAIL_ORIGIN: 'https://crm.example.invalid' }

test('production mail requires explicit flags, a verified request host and a server-only sending key', () => {
  assert.equal(isMailEnabled(productionEnv), true); assert.doesNotThrow(() => assertLiveMail(productionEnv))
  for (const env of [{ ...productionEnv, VERCEL_ENV: 'preview' }, { ...productionEnv, BULK_MAIL_ENABLED: 'false' }, { ...productionEnv, BULK_MAIL_LIVE_SEND_ENABLED: 'false' }, { ...productionEnv, RESEND_API_KEY: '' }]) assert.throws(() => assertLiveMail(env))
  assert.doesNotThrow(() => assertTestHost('crm.example.invalid', productionEnv))
  for (const host of ['127.0.0.1:3000', 'evil.example.invalid', 'crm.example.invalid.evil.test']) assert.throws(() => assertTestHost(host, productionEnv))
  const env = { ...productionEnv, BULK_MAIL_TEST_ENABLED: 'true', BULK_MAIL_TEST_TO: 'test@example.invalid', BULK_MAIL_TEST_FROM: 'sender@example.invalid' }
  assert.equal(manualTestSettings(env).canSend, true)
})

test('live batches queue only on manual start, deduplicate and never run in the simulation worker', async () => {
  const f = await setup()
  try {
    const repo = new MailRepository(f.db, f.repo.crm, { deliveryMode: 'live', from: productionEnv.BULK_MAIL_FROM })
    const c = await repo.save({ ...f.input, companyIds: [f.company, f.second, f.duplicate] }, f.actor)
    await repo.test(c.id, c.version, f.actor)
    const reviewed = await repo.review(c.id, c.version, f.actor)
    assert.equal(reviewed.review![0].from, 'Acoru合同会社 <sender@example.invalid>')
    let calls = 0
    const fetcher: typeof fetch = async (_url, init) => {
      calls++; const payload = JSON.parse(String(init?.body))
      assert.equal(payload.to.length, 1); assert.ok(['office@example.invalid', 'info@example.invalid'].includes(payload.to[0]))
      assert.equal(payload.from, reviewed.review![0].from); assert.ok(payload.text.endsWith(signature))
      return Response.json({ id: randomUUID() })
    }
    await sendCampaign(repo, c.id, productionEnv, { fetcher, pause: async () => {} }); assert.equal(calls, 0)
    await repo.start(c.id, c.version, f.actor)
    await drainMail(repo, async () => { throw new Error('simulation must never claim live deliveries') })
    assert.equal((await repo.campaign(c.id)).deliveries.filter(d => d.status === 'pending').length, 2)
    await Promise.all([sendCampaign(repo, c.id, productionEnv, { fetcher, pause: async () => {} }), sendCampaign(repo, c.id, productionEnv, { fetcher, pause: async () => {} })])
    const done = await repo.campaign(c.id)
    assert.equal(calls, 2); assert.equal(done.status, 'completed'); assert.equal(done.deliveries.filter(d => d.status === 'sent').length, 2)
    await sendCampaign(repo, c.id, productionEnv, { fetcher, pause: async () => {} }); assert.equal(calls, 2)
    await assert.rejects(repo.retry(c.id, c.version, f.actor), /再送できません/)
  } finally { await f.store.close() }
})

test('live sends recheck addresses and uncertain claims are never sent again on resume', async () => {
  const f = await setup()
  try {
    const repo = new MailRepository(f.db, f.repo.crm, { deliveryMode: 'live', from: productionEnv.BULK_MAIL_FROM })
    const c = await repo.save(f.input, f.actor)
    await repo.test(c.id, c.version, f.actor); await repo.review(c.id, c.version, f.actor); await repo.start(c.id, c.version, f.actor)
    let calls = 0
    await sendCampaign(repo, c.id, productionEnv, { fetcher: async () => { calls++; throw new Error('provider result unknown') }, pause: async () => {} })
    assert.equal(calls, 1)
    const partial = await repo.campaign(c.id)
    assert.equal(partial.deliveries.filter(d => d.status === 'uncertain').length, 1)
    const pending = partial.deliveries.find(d => d.status === 'pending')!
    await repo.saveAddress({ companyId: pending.companyId, email: 'changed@example.invalid', version: 1 }, f.actor)
    await repo.resume(c.id, c.version, f.actor)
    await sendCampaign(repo, c.id, productionEnv, { fetcher: async () => { calls++; return Response.json({ id: randomUUID() }) }, pause: async () => {} })
    const done = await repo.campaign(c.id)
    assert.equal(calls, 1); assert.equal(done.status, 'completed')
    assert.equal(done.deliveries.filter(d => d.status === 'uncertain').length, 1)
    assert.equal(done.deliveries.filter(d => d.status === 'excluded').length, 1)
  } finally { await f.store.close() }
})

test('interrupted live sending is marked uncertain after its lease expires and never retried', async () => {
  const f = await setup()
  try {
    const repo = new MailRepository(f.db, f.repo.crm, { deliveryMode: 'live', from: productionEnv.BULK_MAIL_FROM })
    const c = await repo.save({ ...f.input, companyIds: [f.company] }, f.actor)
    await repo.test(c.id, c.version, f.actor); await repo.review(c.id, c.version, f.actor); await repo.start(c.id, c.version, f.actor)
    await f.db.query("UPDATE mail_deliveries SET status='sending',attempts=1,updated_at=now()-interval '6 minutes' WHERE campaign_id=$1", [c.id])
    let calls = 0
    await sendCampaign(repo, c.id, productionEnv, { fetcher: async () => { calls++; return Response.json({ id: randomUUID() }) }, pause: async () => {} })
    assert.equal(calls, 0); assert.equal((await repo.campaign(c.id)).deliveries[0].status, 'uncertain')
    assert.equal((await repo.campaign(c.id)).status, 'completed')
  } finally { await f.store.close() }
})

test('manual-test environment, loopback and content restrictions fail closed', () => {
  assert.equal(manualTestSettings(testEnv).canSend, true)
  for (const env of [{ ...testEnv, NODE_ENV: 'production' }, { ...testEnv, VERCEL: '1' }, { ...testEnv, VERCEL_ENV: 'preview' }, { ...testEnv, BULK_MAIL_TEST_ENABLED: 'false' }, { ...testEnv, BULK_MAIL_TEST_API_KEY: '' }, { ...testEnv, BULK_MAIL_TEST_TO: 'a@example.invalid,b@example.invalid' }, { ...testEnv, BULK_MAIL_TEST_FROM: 'sender@example.invalid\nBcc:x@example.invalid' }]) assert.equal(manualTestSettings(env).canSend, false)
  for (const host of ['localhost:3000', '127.0.0.1:3000', '[::1]:3000']) assert.doesNotThrow(() => assertTestHost(host))
  for (const host of [null, 'example.com', 'localhost.example.com:3000', '127.0.0.1:3000/path', 'user@localhost:3000']) assert.throws(() => assertTestHost(host))
  for (const data of [{ ...testContent, to: 'injected@example.invalid' }, { ...testContent, subject: 'a\nb' }, { ...testContent, body: '{{会社名}}' }]) assert.equal(testContentSchema.safeParse(data).success, false)
})

test('manual test preparation works without a key and never queues or sends email', async () => {
  const f = await setup(false)
  try {
    const tests = new ManualTestMail(f.db), env = { ...testEnv, BULK_MAIL_TEST_API_KEY: '' }
    const preview = await tests.prepare(testContent, f.actor, env)
    assert.equal(preview.status, 'prepared')
    assert.deepEqual(preview.payload, { from: 'Acoru合同会社 <sender@example.invalid>', to: ['test-recipient@example.invalid'], subject: '【テスト】表示確認', text: `${testContent.body}\n\n${signature}` })
    assert.equal((await new ManualTestMail(f.db).prepare(testContent, f.actor, env)).id, preview.id)
    let calls = 0
    await assert.rejects(tests.send(preview.id, f.actor, env, async () => { calls++; throw new Error('must not send') }), /APIキー/)
    await drainMail(f.repo)
    assert.equal(calls, 0); assert.equal((await f.db.query('SELECT id FROM mail_deliveries')).length, 0)
    assert.equal((await f.db.query("SELECT id FROM mail_events WHERE action='manual_test_started'")).length, 0)
  } finally { await f.store.close() }
})

test('manual confirmation claims one durable email to the configured recipient even under concurrent requests', async () => {
  const f = await setup()
  try {
    const tests = new ManualTestMail(f.db), preview = await tests.prepare(testContent, f.actor, testEnv)
    let calls = 0
    const providerId = randomUUID()
    const fetcher: typeof fetch = async (url, init) => {
      calls++; assert.equal(url, 'https://api.resend.com/emails')
      assert.deepEqual(JSON.parse(String(init?.body)), preview.payload)
      assert.equal(new Headers(init?.headers).get('Idempotency-Key'), `local-manual-test-${preview.id}`)
      return Response.json({ id: providerId })
    }
    const results = await Promise.allSettled([tests.send(preview.id, f.actor, testEnv, fetcher), tests.send(preview.id, f.actor, testEnv, fetcher)])
    assert.equal(calls, 1); assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
    const saved = await new ManualTestMail(f.db).prepare(testContent, f.actor, testEnv)
    assert.equal(saved.id, preview.id); assert.equal(saved.status, 'sent'); assert.equal(saved.providerId, providerId)
    await assert.rejects(tests.send(preview.id, f.actor, testEnv, fetcher), /再送/); assert.equal(calls, 1)
    assert.equal((await f.db.query('SELECT id FROM mail_deliveries')).length, 0)
  } finally { await f.store.close() }
})

test('manual test rejects recipient changes and other actors, and never resends an uncertain result', async () => {
  const f = await setup()
  try {
    const tests = new ManualTestMail(f.db), preview = await tests.prepare(testContent, f.actor, testEnv)
    let calls = 0
    const fetcher: typeof fetch = async () => { calls++; throw new Error('timeout after provider may have accepted') }
    await assert.rejects(tests.send(preview.id, { ...f.actor, id: randomUUID() }, testEnv, fetcher), /送信済み/)
    await assert.rejects(tests.send(preview.id, f.actor, { ...testEnv, BULK_MAIL_TEST_TO: 'changed@example.invalid' }, fetcher), /設定が変わって/)
    assert.equal(calls, 0)
    assert.equal((await tests.send(preview.id, f.actor, testEnv, fetcher)).status, 'uncertain')
    const restarted = new ManualTestMail(f.db)
    assert.equal((await restarted.prepare(testContent, f.actor, testEnv)).status, 'uncertain')
    await assert.rejects(restarted.send(preview.id, f.actor, testEnv, fetcher), /再送/); assert.equal(calls, 1)
  } finally { await f.store.close() }
})

test('local/admin gates, company-only input, and exact fixed signature', () => {
  assert.equal(isLocalMailEnabled({ BULK_MAIL_LOCAL_ENABLED: 'true' }), true)
  for (const env of [{}, { BULK_MAIL_LOCAL_ENABLED: 'true', VERCEL: '1' }, { BULK_MAIL_LOCAL_ENABLED: 'true', VERCEL_ENV: 'preview' }]) assert.equal(isLocalMailEnabled(env), false)
  assert.throws(() => assertMailAdmin(null)); assert.throws(() => assertMailAdmin({ is_active: true, role: 'viewer' })); assert.throws(() => assertMailAdmin({ is_active: false, role: 'admin' }))
  assert.equal(isMailError(Object.assign(new Error('conflict'), { name: 'MailError', status: 409 })), true)
  const mail = renderMail({ subject: '{{会社名}}', body: '{{会社名}} ご担当者様' }, { companyName: '会社\r\n{{会社名}}' })
  assert.equal(mail.subject.includes('\n'), false)
  assert.equal(mail.text, `会社\r\n{{会社名}} ご担当者様\n\n${signature}`)
  for (const input of [{ subject: 'x\ny', body: 'body', companyIds: [randomUUID()] }, { subject: 'x', body: '{{氏名}}', companyIds: [randomUUID()] }, { subject: 'x', body: 'body', contactIds: [randomUUID()] }]) assert.equal(draftSchema.safeParse(input).success, false)
})

test('representative addresses are independent of billing and contacts, support clearing, and reject stale/invalid changes', async () => {
  const f = await setup(false)
  try {
    assert.equal((await f.repo.choices()).find(c => c.id === f.company)!.email, null)
    const first = await f.repo.saveAddress({ companyId: f.company, email: '  rep@example.invalid  ', version: 0 }, f.actor)
    assert.deepEqual(first, { email: 'rep@example.invalid', version: 1 })
    assert.equal((await f.repo.choices()).find(c => c.id === f.company)!.email, 'rep@example.invalid')
    assert.equal((await f.db.query('SELECT email FROM contacts'))[0].email, 'contact@example.invalid')
    assert.equal((await f.db.query('SELECT email FROM billing.customers'))[0].email, 'billing@example.invalid')
    assert.equal(f.sourceReads.some(q => /contacts|billing\./.test(q)), false)
    const results = await Promise.allSettled(['one@example.invalid', 'two@example.invalid'].map(email => f.repo.saveAddress({ companyId: f.company, email, version: 1 }, f.actor)))
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
    await assert.rejects(f.repo.saveAddress({ companyId: f.company, email: 'invalid', version: 2 }, f.actor))
    await assert.rejects(f.repo.saveAddress({ companyId: randomUUID(), email: 'valid@example.invalid', version: 0 }, f.actor), /顧客が見つかりません/)
    await f.repo.saveAddress({ companyId: f.company, email: '', version: 2 }, f.actor)
    assert.equal((await f.repo.choices()).find(c => c.id === f.company)!.email, null)
    assert.equal((await f.db.query('SELECT email FROM billing.customers'))[0].email, 'billing@example.invalid')
  } finally { await f.store.close() }
})

test('company eligibility, missing addresses, stops, deduplication and immutable snapshots', async () => {
  const f = await setup()
  try {
    await f.repo.stop('info@example.invalid', true, f.actor)
    const c = await f.repo.save({ ...f.input, companyIds: [f.company, f.duplicate, f.second, f.missing, f.other] }, f.actor)
    await f.repo.test(c.id, c.version, f.actor)
    const reviewed = await f.repo.review(c.id, c.version, f.actor)
    assert.deepEqual(reviewed.review!.map(r => r.exclusion), [null, '同一メールアドレスの重複', '業務連絡の送信停止対象', '代表メール未登録', '契約済みの有効顧客ではありません'])
    assert.equal(reviewed.review![0].text, `契約顧客\nご担当者様\nお知らせです。\n\n${signature}`)
    await f.repo.start(c.id, c.version, f.actor); await drainMail(f.repo)
    const done = await f.repo.campaign(c.id)
    assert.equal(done.status, 'completed'); assert.equal(done.recipientMode, 'company')
    assert.equal(done.deliveries.filter(d => d.status === 'simulated').length, 1)
    assert.equal(done.deliveries.filter(d => d.status === 'excluded').length, 4)
    assert.equal((await f.db.query('SELECT contact_id FROM mail_deliveries')).every(r => r.contact_id === null), true)
    await f.repo.saveAddress({ companyId: f.company, email: 'new@example.invalid', version: 1 }, f.actor)
    assert.equal((await f.repo.campaign(c.id)).deliveries.find(d => d.companyId === f.company)!.email, 'office@example.invalid')
    assert.equal((await f.repo.list(f.company)).length, 1)
  } finally { await f.store.close() }
})

test('test/review required; editing invalidates both and stale saves cannot overwrite', async () => {
  const f = await setup()
  try {
    const c = await f.repo.save(f.input, f.actor)
    await assert.rejects(f.repo.review(c.id, c.version, f.actor), /テスト/)
    await assert.rejects(f.repo.start(c.id, c.version, f.actor))
    await f.repo.test(c.id, c.version, f.actor); await f.repo.review(c.id, c.version, f.actor)
    const edited = await f.repo.save({ ...f.input, body: '変更後' }, f.actor, c.id, c.version)
    assert.equal(edited.testedVersion, null); assert.equal(edited.review, null)
    await assert.rejects(f.repo.save(f.input, f.actor, c.id, c.version), /更新/)
    await assert.rejects(f.repo.start(c.id, c.version, f.actor))
    await assert.rejects(f.repo.test(c.id, c.version, f.actor), /変更/)
    assert.equal((await f.repo.campaign(c.id)).testedVersion, null)
  } finally { await f.store.close() }
})

test('address, deletion, contract and stop changes after review require reconfirmation', async () => {
  for (const mutation of ['address', 'delete', 'contract', 'stop']) {
    const f = await setup()
    try {
      const c = await prepared(f)
      if (mutation === 'address') await f.repo.saveAddress({ companyId: f.company, email: 'changed@example.invalid', version: 1 }, f.actor)
      if (mutation === 'delete') await f.db.query('UPDATE companies SET deleted_at=now() WHERE id=$1', [f.company])
      if (mutation === 'contract') await f.db.query("UPDATE deals SET status='lost' WHERE company_id=$1", [f.company])
      if (mutation === 'stop') await f.repo.stop('office@example.invalid', true, f.actor)
      await assert.rejects(f.repo.start(c.id, c.version, f.actor), /最終確認/)
      assert.equal((await f.repo.campaign(c.id)).deliveries.length, 0)
    } finally { await f.store.close() }
  }
})

test('concurrent starts/workers send once per company even with no CRM contacts', async () => {
  const f = await setup()
  try {
    const c = await prepared(f)
    const attempts = await Promise.allSettled([f.repo.start(c.id, c.version, f.actor), f.repo.start(c.id, c.version, f.actor)])
    assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 1)
    let processed = 0
    await Promise.all([drainMail(f.repo, async () => { processed++ }), drainMail(f.repo, async () => { processed++ })])
    assert.equal(processed, 2)
    const done = await f.repo.campaign(c.id)
    assert.equal(done.deliveries.length, 2)
    assert.equal(done.deliveries.every(d => d.attempts === 1 && !d.contactId), true)
    await assert.rejects(f.repo.save(f.input, f.actor, c.id, c.version), /送信開始済み/)
  } finally { await f.store.close() }
})

test('worker rechecks the representative address; only failed simulations can retry', async () => {
  const f = await setup()
  try {
    const c = await prepared(f)
    await f.repo.start(c.id, c.version, f.actor)
    await f.repo.stop('info@example.invalid', true, f.actor)
    await drainMail(f.repo, async () => { throw new Error('simulation fault') })
    let done = await f.repo.campaign(c.id)
    assert.equal(done.deliveries.find(d => d.companyId === f.second)!.status, 'excluded')
    assert.equal(done.deliveries.find(d => d.companyId === f.company)!.status, 'failed')
    await f.repo.retry(c.id, c.version, f.actor); await drainMail(f.repo)
    done = await f.repo.campaign(c.id)
    assert.equal(done.deliveries.find(d => d.companyId === f.company)!.attempts, 2)
    await f.db.query("UPDATE mail_deliveries SET status='uncertain' WHERE company_id=$1", [f.company])
    await assert.rejects(f.repo.retry(c.id, c.version, f.actor), /失敗はありません/)
  } finally { await f.store.close() }
})

test('legacy local data migrates without changing old content or completed results, and cannot send again', async () => {
  const store = new PGlite()
  try {
    await store.exec(`CREATE TABLE mail_campaigns(id uuid PRIMARY KEY,version int DEFAULT 1,subject text,body text,contact_ids jsonb NOT NULL,status text,actor_id uuid,actor_name text,tested_version int,review jsonb,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE mail_deliveries(id uuid PRIMARY KEY,campaign_id uuid REFERENCES mail_campaigns(id),contact_id uuid NOT NULL,email_key text,snapshot jsonb,status text,attempts int DEFAULT 0,result text,updated_at timestamptz DEFAULT now(),UNIQUE(campaign_id,contact_id));`)
    const id = randomUUID(), contact = randomUUID(), other = randomUUID(), company = randomUUID(), actor = { id: randomUUID(), name: '管理者', email: 'admin@example.invalid' }
    const snapshot = { contactId: contact, companyId: company, companyName: '旧顧客', name: '旧担当者', email: 'old@example.invalid', subject: '旧件名', text: '当時の本文と署名', exclusion: null }
    await store.query("INSERT INTO mail_campaigns(id,subject,body,contact_ids,status,actor_id,actor_name,review) VALUES($1,'旧件名','{{氏名}} 様',$2::jsonb,'queued',$3,'管理者',$4::jsonb)", [id, JSON.stringify([contact, other]), actor.id, JSON.stringify([snapshot])])
    await store.query("INSERT INTO mail_deliveries(id,campaign_id,contact_id,email_key,snapshot,status,result) VALUES($1,$2,$3,'old@example.invalid',$4::jsonb,'simulated','過去の結果'),($5,$2,$6,'pending@example.invalid',$7::jsonb,'pending',NULL)", [randomUUID(), id, contact, JSON.stringify(snapshot), randomUUID(), other, JSON.stringify({ ...snapshot, contactId: other, email: 'pending@example.invalid' })])
    await store.exec(localSchema); await store.exec(localSchema)
    const db: MailDb = { ...adapt(store), transaction: fn => store.transaction(tx => fn(adapt(tx))) }
    const repo = new MailRepository(db, { query: async () => { throw new Error('Legacy execution must stop before reading CRM') } })
    const c = await repo.campaign(id)
    assert.equal(c.recipientMode, 'contacts'); assert.equal(c.selectedCount, 2); assert.equal(c.body, '{{氏名}} 様')
    assert.deepEqual(c.review, [snapshot]); assert.equal(c.status, 'completed')
    assert.equal(c.deliveries.find(d => d.contactId === contact)!.result, '過去の結果')
    assert.equal(c.deliveries.find(d => d.contactId === other)!.status, 'excluded')
    for (const action of ['test', 'review', 'start', 'retry'] as const) await assert.rejects(repo[action](id, 1, actor), /旧方式/)
  } finally { await store.close() }
})
