import { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface AlertProps {
  variant?: 'info' | 'warning' | 'danger' | 'success'
  children: ReactNode
}

const variants = {
  info: 'bg-ink/5 border-ink/10 text-ink',
  warning: 'bg-warning/10 border-warning/20 text-warning',
  danger: 'bg-danger/10 border-danger/20 text-danger',
  success: 'bg-success/10 border-success/20 text-success',
}

export function Alert({ variant = 'info', children }: AlertProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`rounded-lg border px-4 py-3 text-sm ${variants[variant]}`}
    >
      {children}
    </motion.div>
  )
}
