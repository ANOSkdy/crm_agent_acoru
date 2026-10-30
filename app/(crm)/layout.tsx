import { AppNavigation } from '@/components/layout/AppNavigation'
import { requireCurrentUser } from '@/lib/auth/session'
import { isMailEnabled } from '@/lib/bulk-mail/domain'
import { logoutAction } from '@/lib/actions/auth'

export const dynamic = 'force-dynamic'

export default async function CrmLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireCurrentUser()

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-topbar__brand">
          <span className="app-topbar__logo" aria-hidden="true">A</span>
          <span>Acoru CRM</span>
        </div>
        <AppNavigation localMail={user.role === 'admin' && isMailEnabled(process.env)} />
        <div className="app-topbar__spacer" />
        <div className="app-topbar__user" aria-label="ログインユーザー">
          <span className="app-topbar__avatar" aria-hidden="true">{user.name.slice(0, 1)}</span>
          <span className="app-topbar__user-name">{user.name}</span>
          <form action={logoutAction}>
            <button type="submit" className="app-topbar__logout">ログアウト</button>
          </form>
        </div>
      </header>
      <main className="app-content">{children}</main>
    </div>
  )
}
