'use client'

import { useEffect, useRef, type ReactNode } from 'react'

const focusableSelector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

export function Modal({ title, children, footer, onClose }: { title: string; children: ReactNode; footer?: ReactNode; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null
    const first = panelRef.current?.querySelector<HTMLElement>(focusableSelector)
    first?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
      if (focusable.length === 0) return
      const firstItem = focusable[0]
      const lastItem = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault()
        lastItem.focus()
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault()
        firstItem.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      openerRef.current?.focus?.()
    }
  }, [onClose])

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div ref={panelRef} aria-modal="true" className="modal-panel" role="dialog" aria-label={title} onMouseDown={(event) => event.stopPropagation()} tabIndex={-1}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" type="button" onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  )
}
