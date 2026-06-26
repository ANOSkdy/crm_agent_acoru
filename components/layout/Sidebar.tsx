import Link from 'next/link'

const navItems = [
  { href: '/dashboard', label: 'ダッシュボード', icon: '📊' },
  { href: '/companies', label: '顧客', icon: '🏢' },
  { href: '/contacts', label: '担当者', icon: '👤' },
  { href: '/deals', label: '案件', icon: '💼' },
  { href: '/activities', label: '活動履歴', icon: '📝' },
  { href: '/tasks', label: 'タスク', icon: '✅' },
  { href: '/files', label: 'ファイル', icon: '📁' },
  { href: '/reports', label: 'レポート', icon: '📈' },
]

export function Sidebar() {
  return (
    <aside className="w-56 min-h-screen bg-gray-900 text-gray-100 flex flex-col">
      <div className="px-4 py-5 border-b border-gray-700">
        <h1 className="text-lg font-bold tracking-tight">Acoru CRM</h1>
      </div>
      <nav className="flex-1 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="border-t border-gray-700 p-4">
        <Link
          href="/logout"
          className="flex items-center gap-3 rounded px-2 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
        >
          <span>🚪</span>
          <span>ログアウト</span>
        </Link>
      </div>
    </aside>
  )
}
