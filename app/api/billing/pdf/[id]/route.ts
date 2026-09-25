import { billingUser, repository } from '@/lib/billing/server'
import { createInvoicePdf } from '@/lib/billing/pdf'

export const runtime = 'nodejs'
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await billingUser())) return new Response('Forbidden', { status: 403 })
  const { id } = await params
  const repo = repository()
  try {
    const invoice = await repo.invoice(id)
    const archived = await repo.archivedPdf(id)
    const bytes = archived
      ? Buffer.from(archived, 'base64')
      : await createInvoicePdf(invoice)
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="invoice_${encodeURIComponent(id)}.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new Response('PDFを取得できません', { status: 404 })
  }
}
