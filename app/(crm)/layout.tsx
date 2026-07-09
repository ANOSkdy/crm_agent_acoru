import { AppNavigation } from '@/components/layout/AppNavigation'
import { requireCurrentUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export default async function CrmLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireCurrentUser()

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__logo" aria-hidden="true">A</span>
          <span>Acoru CRM</span>
        </div>
        <div className="app-header__workspace">営業ワークスペース</div>
        <div className="app-header__spacer" />
        <div className="app-header__user" aria-label="ログインユーザー">
          <span className="app-header__user-name">{user.name}</span>
        </div>
      </header>
      <div className="app-body">
        <AppNavigation />
        <main className="app-content">{children}</main>
      </div>
    </div>
  )
}
