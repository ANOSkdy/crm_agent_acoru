interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'gray'
}

const variantClasses: Record<string, string> = {
  default: 'bg-blue-100 text-blue-800',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-purple-100 text-purple-800',
  gray: 'bg-gray-100 text-gray-700',
}

export function Badge({ children, variant = 'default' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variantClasses[variant]}`}>
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
