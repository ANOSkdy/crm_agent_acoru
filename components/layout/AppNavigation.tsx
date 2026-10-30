'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

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

// Horizontal top-bar navigation. On narrow screens it folds into a menu button.
export function AppNavigation({ localMail = false }: { localMail?: boolean }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => setOpen(false), 0)
    return () => window.clearTimeout(id)
  }, [pathname])

  return (
    <nav className={`app-nav${open ? ' app-nav--open' : ''}`} aria-label="CRM ナビゲーション">
      <button
        type="button"
        className="app-nav__toggle"
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? 'ナビゲーションを折りたたむ' : 'ナビゲーションを展開'}
        aria-expanded={open}
      >
        <span aria-hidden="true">{open ? '×' : '≡'}</span>
      </button>
      <ul className="app-nav__list">
        {[...navItems, ...(localMail ? [{ href: '/bulk-mail', label: '一斉メール' }] : [])].map((item) => {
          const active = isActivePath(pathname, item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`app-nav__item${active ? ' app-nav__item--active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
