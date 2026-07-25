import { SelectHTMLAttributes, ReactNode, forwardRef } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  children: ReactNode
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className = '', children, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-sm font-medium text-ink">{label}</label>
        )}
        <select
          ref={ref}
          className={`rounded-lg border bg-surface px-3 py-2 text-sm text-ink
            transition-colors duration-150
            focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent
            ${error ? 'border-danger ring-2 ring-danger/20' : 'border-border hover:border-ink/30'}
            ${className}`}
          {...props}
        >
          {children}
        </select>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    )
  }
)
Select.displayName = 'Select'
