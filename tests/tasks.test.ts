import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { testDatabase } from './helpers/database'
import { createTaskSchema, taskFieldsSchema, taskStatusLabels } from '../lib/validation/task'
import { createTaskAction, addTaskTabAction } from '../lib/actions/tasks'

test('issue validation covers all four states, required text, real dates and positive integer numbers', () => {
  const input = { company_id: randomUUID(), opened_on: '2026-10-29', title: '  契約内容の確認  ', completion_criteria: '', progress: '', due_date: '' }
  for (const status of Object.keys(taskStatusLabels)) {
    const result = createTaskSchema.parse({ ...input, status })
    assert.equal(result.title, '契約内容の確認')
    assert.equal(result.due_date, null)
    assert.equal(result.issue_number, undefined)
  }
  for (const invalid of [{ title: '  ' }, { opened_on: '2026-02-29' }, { due_date: '2026-04-31' }, { issue_number: '0' }, { issue_number: '1.5' }, { issue_number: 'abc' }, { status: 'cancelled' }, { company_id: '' }]) {
    assert.equal(createTaskSchema.safeParse({ ...input, ...invalid }).success, false, JSON.stringify(invalid))
  }
  assert.equal(taskFieldsSchema.shape.opened_on.safeParse('2028-02-29').success, true)
})

test('migration preserves old tasks and registers customer tabs regardless of company status or contract', async () => {
  const company = randomUUID(), inactive = randomUUID(), task = randomUUID()
  const db = await testDatabase(async db => {
    await db.query("INSERT INTO companies(id,name,status) VALUES($1,'既存顧客','active'),($2,'未契約の顧客','inactive')", [company, inactive])
    await db.query("INSERT INTO tasks(id,company_id,title,description,status,created_at) VALUES($1,$2,'既存内容','既存説明','done','2026-10-28T15:30:00Z')", [task, company])
    await db.query("INSERT INTO tasks(company_id,title) VALUES($1,'未契約の課題')", [inactive])
  })
  try {
    const row = (await db.query("SELECT issue_number,opened_on::text,progress,title,status FROM tasks WHERE id=$1", [task])).rows[0]
    assert.deepEqual(row, { issue_number: 1, opened_on: '2026-10-29', progress: '既存説明', title: '既存内容', status: 'done' })
    assert.equal((await db.query('SELECT * FROM task_company_tabs')).rows.length, 2)
    assert.ok((await db.query<{ fn: string | null }>("SELECT to_regprocedure('apply_agent_changes(uuid,uuid,jsonb)') AS fn")).rows[0].fn)
    assert.ok((await db.query<{ view: string | null }>("SELECT to_regclass('crm_ai_records') AS view")).rows[0].view)
    await db.query('SELECT * FROM crm_live_activities LIMIT 0')
    const legacy = (await db.query<{ progress: string }>("INSERT INTO tasks(company_id,title,description) VALUES($1,'legacy client','legacy description') RETURNING progress", [company])).rows[0]
    assert.equal(legacy.progress, 'legacy description')
  } finally { await db.close() }
})

test('customer scoped numbering, tab persistence, constraints and active issue population', async () => {
  const db = await testDatabase()
  try {
    const first = randomUUID(), second = randomUUID()
    await db.query("INSERT INTO companies(id,name,status) VALUES($1,'A','active'),($2,'B','inactive')", [first, second])
    await db.query('INSERT INTO task_company_tabs(company_id) VALUES($1) ON CONFLICT DO NOTHING', [second])
    await db.query('INSERT INTO task_company_tabs(company_id) VALUES($1) ON CONFLICT DO NOTHING', [second])
    assert.equal((await db.query('SELECT * FROM task_company_tabs')).rows.length, 1)
    const one = (await db.query<{ id: string; issue_number: number }>("INSERT INTO tasks(company_id,title) VALUES($1,'one') RETURNING id,issue_number", [first])).rows[0]
    const [two, other] = await Promise.all([
      db.query<{ issue_number: number }>("INSERT INTO tasks(company_id,title) VALUES($1,'two') RETURNING issue_number", [first]),
      db.query<{ issue_number: number }>("INSERT INTO tasks(company_id,title) VALUES($1,'other') RETURNING issue_number", [second]),
    ])
    assert.equal(one.issue_number, 1); assert.equal(two.rows[0].issue_number, 2); assert.equal(other.rows[0].issue_number, 1)
    await assert.rejects(db.query("INSERT INTO tasks(company_id,issue_number,title) VALUES($1,1,'duplicate')", [first]), { code: '23505' })
    await assert.rejects(db.query("INSERT INTO tasks(company_id,issue_number,title) VALUES($1,0,'zero')", [first]), { code: '23514' })
    await assert.rejects(db.query("UPDATE tasks SET status='invalid' WHERE id=$1", [one.id]), { code: '23514' })
    await db.query("UPDATE tasks SET status='not_needed',due_date='2000-01-01' WHERE id=$1", [one.id])
    assert.equal((await db.query<{ count: number }>("SELECT count(*)::integer FROM crm_live_tasks WHERE due_date<CURRENT_DATE AND status IN ('open','in_progress')")).rows[0].count, 0)
    await db.query("UPDATE tasks SET deleted_at=now() WHERE company_id=$1", [first])
    assert.equal((await db.query('SELECT * FROM task_company_tabs WHERE company_id=$1', [first])).rows.length, 1)
    await db.query('UPDATE companies SET deleted_at=now() WHERE id=$1', [second])
    assert.equal((await db.query('SELECT * FROM crm_live_tasks')).rows.length, 0)
  } finally { await db.close() }
})

test('direct issue creation and customer tab actions fail closed without authentication', async () => {
  const old = process.env.MFA_ENCRYPTION_KEY
  delete process.env.MFA_ENCRYPTION_KEY
  try {
    assert.ok((await createTaskAction({}, new FormData())).error)
    assert.ok((await addTaskTabAction({}, new FormData())).error)
  } finally { if (old === undefined) delete process.env.MFA_ENCRYPTION_KEY; else process.env.MFA_ENCRYPTION_KEY = old }
})
