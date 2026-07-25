import { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface PageLayoutProps {
  title: string
  actions?: ReactNode
  children: ReactNode
}

export function PageLayout({ title, actions, children }: PageLayoutProps) {
  return (
    <main className="ml-60 min-h-screen">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
        className="px-8 py-6"
      >
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-ink">{title}</h1>
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
        {children}
      </motion.div>
    </main>
  )
}
