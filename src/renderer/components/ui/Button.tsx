import { ButtonHTMLAttributes, ReactNode } from 'react'
import { motion } from 'framer-motion'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

const variants = {
  primary: 'bg-accent text-white hover:bg-accent-hover active:bg-accent-hover',
  secondary: 'bg-ink text-white hover:bg-ink/90 active:bg-ink/80',
  danger: 'bg-danger text-white hover:bg-danger/90 active:bg-danger/80',
  ghost: 'bg-transparent text-ink hover:bg-ink/5 active:bg-ink/10',
}

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-2.5 text-base',
}

export function Button({ variant = 'primary', size = 'md', className = '', children, disabled, ...props }: ButtonProps) {
  return (
    <motion.button
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.15, ease: [0.25, 1, 0.5, 1] }}
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors duration-150
        focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled}
      {...(props as any)}
    >
      {children}
    </motion.button>
  )
}
