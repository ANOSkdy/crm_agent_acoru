import { redirect } from 'next/navigation'

// Companies are edited in place; this route remains for old links.
export default async function EditCompanyPage({ params }: { params: Promise<{ companyId: string }> }) {
  redirect(`/companies/${(await params).companyId}`)
}
