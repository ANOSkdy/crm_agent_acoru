import { z } from 'zod'
import { lineSchema, totals, type Invoice, type Settings } from './domain'

export const ACORU_TEMPLATE = {
  name: 'Acoru帳票テンプレート',
  version: '1.0.0',
  page: { width: 595.5, height: 842.25 },
  colors: {
    purple: [83 / 255, 68 / 255, 145 / 255],
    ink: [0.22, 0.22, 0.26],
    muted: [0.43, 0.43, 0.49],
    pale: [0.965, 0.957, 0.983],
    rule: [0.84, 0.83, 0.88],
  },
} as const

const common = {
  name: z.string().trim().min(1).max(120),
  honorific: z.string().trim().min(1).max(20),
  subject: z.string().trim().max(100),
  issueDate: z.iso.date(),
  lines: z.array(lineSchema).min(1).max(100),
  sample: z.boolean().default(true),
}
export const templateInputSchema = z
  .discriminatedUnion('kind', [
    z.object({ ...common, kind: z.literal('invoice'), dueDate: z.iso.date() }),
    z.object({
      ...common,
      kind: z.literal('quotation'),
      validUntil: z.iso.date(),
      delivery: z.string().trim().max(100),
      conditions: z.string().trim().max(300),
    }),
  ])
  .superRefine((data, ctx) => {
    const deadline = data.kind === 'invoice' ? data.dueDate : data.validUntil
    if (deadline < data.issueDate)
      ctx.addIssue({
        code: 'custom',
        path: [data.kind === 'invoice' ? 'dueDate' : 'validUntil'],
        message: '期限は発行日以降にしてください',
      })
  })
export type TemplateInput = z.infer<typeof templateInputSchema>
export type DocumentOptions =
  | { kind: 'invoice' }
  | {
      kind: 'quotation'
      validUntil: string
      delivery: string
      conditions: string
    }

export function templateDocument(
  input: TemplateInput,
  issuer: Settings['issuer'],
): Invoice {
  return {
    id: 'TEMPLATE',
    customer_id: null,
    period: input.issueDate.slice(0, 7),
    status: 'held',
    version: 1,
    ...totals(input.lines),
    document: {
      name: input.name,
      honorific: input.honorific,
      subject: input.subject,
      issueDate: input.issueDate,
      dueDate: input.kind === 'invoice' ? input.dueDate : input.validUntil,
      lines: input.lines,
      issuer,
      email: 'template@example.invalid',
      provisional: input.sample,
    },
  }
}
