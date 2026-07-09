'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { logoutAction } from '@/lib/actions/auth'

const NAV_COLLAPSED_KEY = 'acoru.crm.navCollapsed'

const navItems = [
  { href: '/dashboard', label: 'ダッシュボード' },
  { href: '/companies', label: '顧客' },
  { href: '/contacts', label: '担当者' },
  { href: '/deals', label: '案件' },
  { href: '/activities', label: '活動履歴' },
  { href: '/tasks', label: 'タスク' },
  { href: '/files', label: 'ファイル' },
  { href: '/reports', label: 'レポート' },
]

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AppNavigation() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => {
      setCollapsed(localStorage.getItem(NAV_COLLAPSED_KEY) === 'true')
    }, 0)

    return () => window.clearTimeout(id)
  }, [])

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current
      localStorage.setItem(NAV_COLLAPSED_KEY, String(next))
      return next
    })
  }

  return (
    <nav className={`app-nav${collapsed ? ' app-nav--collapsed' : ''}`} aria-label="CRM ナビゲーション">
      <div className="app-nav__header">
        <button
          type="button"
          className="app-nav__toggle"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'ナビゲーションを展開' : 'ナビゲーションを折りたたむ'}
          aria-expanded={!collapsed}
        >
          <span aria-hidden="true">{collapsed ? '›' : '‹'}</span>
        </button>
      </div>
      <ul className="app-nav__list">
        {navItems.map((item) => {
          const active = isActivePath(pathname, item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`app-nav__item${active ? ' app-nav__item--active' : ''}`}
                aria-current={active ? 'page' : undefined}
                title={collapsed ? item.label : undefined}
              >
                <span className="app-nav__item-label">{item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
      <div className="app-nav__footer">
        <form action={logoutAction}>
          <button type="submit" className="app-nav__item app-header__logout" title={collapsed ? 'ログアウト' : undefined}>
            <span className="app-nav__item-label">ログアウト</span>
          </button>
        </form>
      </div>
    </nav>
  )
}
