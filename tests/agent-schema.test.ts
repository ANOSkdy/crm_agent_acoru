import test from 'node:test'
import assert from 'node:assert/strict'
import { dateOnly, operationsSchema, messageSchema } from '../lib/agent/schema'

test('real dates only, including leap years', () => {
  assert.equal(dateOnly.safeParse('2026-02-29').success, false)
  assert.equal(dateOnly.safeParse('2028-02-29').success, true)
  assert.equal(dateOnly.safeParse('2026-13-01').success, false)
  assert.equal(dateOnly.safeParse('next Tuesday').success, false)
})
test('reject foreign identifiers, arbitrary operations and empty changes', () => {
  assert.equal(operationsSchema.safeParse([]).success, false)
  assert.equal(operationsSchema.safeParse([{ type: 'sql', query: 'DELETE FROM deals' }]).success, false)
  assert.equal(operationsSchema.safeParse([{ type: 'create_task', title: '確認', description: '', due_date: null, priority: 'high', deal_id: 'other' }]).success, false)
})
test('only one update per field group; no duplicate task completions', () => {
  const progress = { type: 'progress', current_summary: '提案中', health: 'on_track', blockers: '', next_review_date: null }
  assert.equal(operationsSchema.safeParse([progress]).success, true)
  assert.equal(operationsSchema.safeParse([progress, progress]).success, false)
  const complete = { type: 'complete_task', task_id: '11111111-1111-4111-8111-111111111111' }
  assert.equal(operationsSchema.safeParse([complete, complete]).success, false)
})
test('reject invalid commercial numbers and unbounded message input', () => {
  const deal = { type: 'deal', stage_id: null, status: 'open', probability: 101, amount: 100, expected_close_date: null }
  assert.equal(operationsSchema.safeParse([deal]).success, false)
  assert.equal(messageSchema.safeParse({ requestId: '11111111-1111-4111-8111-111111111111', message: 'x'.repeat(6001) }).success, false)
})
