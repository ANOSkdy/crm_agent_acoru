import { Sidebar } from '@/components/layout/Sidebar'
import { requireCurrentUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export default async function CrmLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireCurrentUser()

  return (
    <div className="h-full flex bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
