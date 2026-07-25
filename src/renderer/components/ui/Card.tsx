import { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface CardProps {
  children: ReactNode
  className?: string
  hover?: boolean
}

export function Card({ children, className = '', hover = false }: CardProps) {
  return (
    <motion.div
      whileHover={hover ? { y: -2, boxShadow: '0 8px 25px -5px rgba(0,0,0,0.1)' } : undefined}
      transition={{ duration: 0.2 }}
      className={`bg-surface rounded-xl border border-border p-6 ${className}`}
    >
      {children}
    </motion.div>
  )
}
