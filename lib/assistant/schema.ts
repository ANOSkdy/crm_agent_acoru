import { z } from 'zod'
import { dateOnly, proposalSchema } from '@/lib/agent/schema'

export const entitySchema = z.enum(['company', 'deal', 'contact', 'activity', 'task', 'decision', 'file'])
export const searchSchema = z.object({
  query: z.string().trim().max(160).default(''),
  entity: z.enum(['all', ...entitySchema.options]).default('all'),
  company_id: z.string().uuid().nullable().default(null),
  deal_id: z.string().uuid().nullable().default(null),
  status: z.string().max(30).nullable().default(null),
  date_from: dateOnly.nullable().default(null), date_to: dateOnly.nullable().default(null),
  offset: z.number().int().min(0).max(10000).default(0),
}).strict()
export const recordSchema = z.object({ entity: entitySchema, id: z.string().uuid() }).strict()
export const metricsSchema = z.object({ company_id: z.string().uuid().nullable().default(null), close_from: dateOnly.nullable().default(null), close_to: dateOnly.nullable().default(null) }).strict()
export const prioritySchema = z.object({ category: z.enum(['overdue_tasks', 'stale_deals', 'closing_soon', 'at_risk']), company_id: z.string().uuid().nullable().default(null), offset: z.number().int().min(0).max(10000).default(0) }).strict()
export const answerSchema = z.object({
  answer: z.string().trim().min(1).max(16000),
  source_ids: z.array(z.string().regex(/^S\d+$/)).max(30),
  proposal: proposalSchema.extend({ deal_id: z.string().uuid() }).nullable(),
}).strict()
export const createThreadSchema = z.object({ title: z.string().trim().min(1).max(80), contextDealId: z.string().uuid().nullable().default(null) }).strict()
export type SearchInput = z.infer<typeof searchSchema>
export type RecordInput = z.infer<typeof recordSchema>
export type MetricsInput = z.infer<typeof metricsSchema>
export type PriorityInput = z.infer<typeof prioritySchema>
