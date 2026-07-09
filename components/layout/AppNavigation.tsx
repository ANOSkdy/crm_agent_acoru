'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { logoutAction } from '@/lib/actions/auth'

const NAV_COLLAPSED_KEY = 'acoru.crm.navCollapsed'

const navItems = [
  { href: '/dashboard', label: 'ダッシュボード', icon: 'D' },
  { href: '/companies', label: '顧客', icon: '顧' },
  { href: '/contacts', label: '担当者', icon: '担' },
  { href: '/deals', label: '案件', icon: '案' },
  { href: '/activities', label: '活動履歴', icon: '活' },
  { href: '/tasks', label: 'タスク', icon: 'T' },
  { href: '/files', label: 'ファイル', icon: 'F' },
  { href: '/reports', label: 'レポート', icon: 'R' },
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
                <span className="app-nav__item-icon" aria-hidden="true">{item.icon}</span>
                <span className="app-nav__item-label">{item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
      <div className="app-nav__footer">
        <form action={logoutAction}>
          <button type="submit" className="app-nav__item app-header__logout" title={collapsed ? 'ログアウト' : undefined}>
            <span className="app-nav__item-icon" aria-hidden="true">↗</span>
            <span className="app-nav__item-label">ログアウト</span>
          </button>
        </form>
      </div>
    </nav>
  )
}
