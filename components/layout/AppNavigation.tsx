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
  { href: '/tasks', label: '課題管理' },
  { href: '/billing', label: '請求管理' },
]

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AppNavigation({ localMail = false }: { localMail?: boolean }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 640px)')
    const restore = () => {
      const saved = localStorage.getItem(NAV_COLLAPSED_KEY)
      setCollapsed(saved === null ? mobile.matches : saved === 'true')
    }
    const id = window.setTimeout(restore, 0)
    mobile.addEventListener('change', restore)
    return () => { window.clearTimeout(id); mobile.removeEventListener('change', restore) }
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
        {[...navItems, ...(localMail ? [{ href: '/bulk-mail', label: '一斉メール' }] : [])].map((item) => {
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
          <button type="submit" className="app-nav__item app-nav__logout" title={collapsed ? 'ログアウト' : undefined}>
            <span className="app-nav__logout-icon" aria-hidden="true">↩</span>
            <span className="app-nav__item-label">ログアウト</span>
          </button>
        </form>
      </div>
    </nav>
  )
}
