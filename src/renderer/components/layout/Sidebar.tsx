import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'

const navItems = [
  { to: '/', label: 'Inicio', icon: '◉' },
  { to: '/clientes', label: 'Clientes', icon: '◎' },
  { to: '/pases', label: 'Pases', icon: '◈' },
  { to: '/planes', label: 'Planes', icon: '◇' },
  { to: '/pagos', label: 'Pagos', icon: '$' },
  { to: '/profesores', label: 'Profesores', icon: '◉' },
  { to: '/ventas', label: 'Ventas', icon: '◈' },
  { to: '/kiosco', label: 'Kiosco', icon: '◎' },
  { to: '/empleados', label: 'Empleados', icon: '◉' },
  { to: '/gastos', label: 'Gastos', icon: '◇' },
  { to: '/caja', label: 'Caja', icon: '$' },
  { to: '/informes', label: 'Informes', icon: '◈' },
]

export function Sidebar() {
  return (
    <aside className="flex flex-col w-60 bg-panel h-screen fixed left-0 top-0 border-r border-border">
      <div className="px-5 py-5">
        <h1 className="text-lg font-bold text-ink tracking-tight">Lebloc</h1>
      </div>
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item, index) => (
          <motion.div
            key={item.to}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: index * 0.03 }}
          >
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150
                ${isActive
                  ? 'bg-accent text-white'
                  : 'text-ink/70 hover:text-ink hover:bg-ink/5'
                }`
              }
            >
              <span className="w-5 text-center text-xs opacity-70">{item.icon}</span>
              {item.label}
            </NavLink>
          </motion.div>
        ))}
      </nav>
      <div className="px-5 py-4 text-xs text-muted border-t border-border">
        v1.0
      </div>
    </aside>
  )
}
