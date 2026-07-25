import { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface Column<T> {
  key: string
  header: string
  render?: (item: T) => ReactNode
  className?: string
}

interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  onRowClick?: (item: T) => void
  emptyMessage?: string
}

export function Table<T extends { id: number }>({ columns, data, onRowClick, emptyMessage = 'Sin datos' }: TableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="bg-surface rounded-xl border border-border p-12 text-center">
        <p className="text-muted text-sm">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-bg">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider ${col.className || ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item, index) => (
            <motion.tr
              key={item.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3) }}
              onClick={() => onRowClick?.(item)}
              className={`border-b border-border/50 last:border-0 transition-colors duration-150
                ${onRowClick ? 'cursor-pointer hover:bg-accent/5' : ''}`}
            >
              {columns.map((col) => (
                <td key={col.key} className={`px-4 py-3 text-sm text-ink ${col.className || ''}`}>
                  {col.render ? col.render(item) : (item as any)[col.key]}
                </td>
              ))}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
