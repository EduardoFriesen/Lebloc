interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'danger'
  children: React.ReactNode
}

const variants = {
  default: 'bg-ink/5 text-ink',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
}

export function Badge({ variant = 'default', children }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  )
}
