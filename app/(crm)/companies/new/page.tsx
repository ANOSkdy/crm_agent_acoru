import { redirect } from 'next/navigation'

// Records are created in the grid; this route remains for old links.
export default function NewCompanyPage() {
  redirect('/companies')
}
