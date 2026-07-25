import { InputHTMLAttributes, forwardRef } from 'react'
import { motion } from 'framer-motion'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-sm font-medium text-ink">{label}</label>
        )}
        <motion.input
          ref={ref}
          whileFocus={{ scale: 1.01 }}
          transition={{ duration: 0.15 }}
          className={`rounded-lg border bg-surface px-3 py-2 text-sm text-ink
            placeholder:text-muted transition-colors duration-150
            focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent
            ${error ? 'border-danger ring-2 ring-danger/20' : 'border-border hover:border-ink/30'}
            ${className}`}
          {...(props as any)}
        />
        {error && (
          <motion.span
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-danger"
          >
            {error}
          </motion.span>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'
