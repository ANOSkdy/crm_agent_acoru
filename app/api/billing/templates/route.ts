import { billingUser, repository } from '@/lib/billing/server'
import {
  templateInputSchema,
  templateDocument,
  ACORU_TEMPLATE,
} from '@/lib/billing/template'
import { createBusinessDocumentPdf } from '@/lib/billing/pdf'
import { z } from 'zod'

export const runtime = 'nodejs'
export const maxDuration = 60
export async function POST(request: Request) {
  if (!(await billingUser())) return new Response('Forbidden', { status: 403 })
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return new Response('Forbidden', { status: 403 })
  try {
    const body = await request.text()
    if (body.length > 100000)
      return new Response('入力が大きすぎます', { status: 413 })
    const input = templateInputSchema.parse(JSON.parse(body))
    const { value } = await repository().settings()
    const bytes = await createBusinessDocumentPdf(
      templateDocument(input, value.issuer),
      input,
    )
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="acoru_${input.kind}_${input.issueDate}.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Acoru-Template-Version': ACORU_TEMPLATE.version,
      },
    })
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? '入力内容と日付を確認してください'
        : error instanceof Error && /[ぁ-んァ-ヶ一-龠]/.test(error.message)
          ? error.message
          : 'PDFを作成できませんでした'
    return Response.json({ error: message }, { status: 400 })
  }
}
