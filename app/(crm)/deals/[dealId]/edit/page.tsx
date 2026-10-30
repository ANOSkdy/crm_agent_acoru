import { redirect } from 'next/navigation'

// Deals are edited in place; this route remains for old links.
export default async function EditDealPage({ params }: { params: Promise<{ dealId: string }> }) {
  redirect(`/deals/${(await params).dealId}`)
}
