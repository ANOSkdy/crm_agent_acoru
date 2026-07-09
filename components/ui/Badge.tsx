interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'gray'
}

const variantClasses: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: 'badge--default',
  success: 'badge--success',
  warning: 'badge--warning',
  danger: 'badge--danger',
  info: 'badge--info',
  gray: 'badge--gray',
}

export function Badge({ children, variant = 'default' }: BadgeProps) {
  return (
    <span className={`badge ${variantClasses[variant]}`}>
      {children}
    </span>
  )
}

export function stageBadgeVariant(stageName: string | null | undefined): BadgeProps['variant'] {
  switch (stageName) {
    case '受注': return 'success'
    case '失注': return 'danger'
    case '交渉中': return 'warning'
    case '提案済み': return 'info'
    default: return 'gray'
  }
}

export function statusBadgeVariant(status: string): BadgeProps['variant'] {
  switch (status) {
    case 'active': return 'success'
    case 'inactive': return 'gray'
    case 'open': return 'default'
    case 'done': return 'success'
    case 'won': return 'success'
    case 'lost': return 'danger'
    default: return 'gray'
  }
}
