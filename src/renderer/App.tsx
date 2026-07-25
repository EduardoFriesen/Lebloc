import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { PageLayout } from './components/layout/PageLayout'
import { Card } from './components/ui/Card'
import { motion } from 'framer-motion'
import { dbQuery } from './lib/db'
import { ClientesPage } from './pages/clientes/ClientesPage'
import { PasesPage } from './pages/pases/PasesPage'
import { PlanesPage } from './pages/planes/PlanesPage'
import { PagosPage } from './pages/pagos/PagosPage'
import { ProfesoresPage } from './pages/profesores/ProfesoresPage'

function Dashboard() {
  const [stats, setStats] = useState({ clientes: 0, planes: 0, ventasMes: 0, cajaAbierta: false })

  useEffect(() => {
    const load = async () => {
      const clientes = await dbQuery('SELECT COUNT(*) as count FROM clientes WHERE activo = 1')
      const planes = await dbQuery('SELECT COUNT(*) as count FROM planes WHERE activo = 1')
      const caja = await dbQuery("SELECT COUNT(*) as count FROM caja WHERE estado = 'abierta'")

      setStats({
        clientes: clientes[0]?.count || 0,
        planes: planes[0]?.count || 0,
        ventasMes: 0, // Will be implemented in Phase 2
        cajaAbierta: (caja[0]?.count || 0) > 0,
      })
    }
    load()
  }, [])

  const cards = [
    { label: 'Clientes activos', value: stats.clientes.toString(), color: 'text-ink' },
    { label: 'Planes activos', value: stats.planes.toString(), color: 'text-ink' },
    { label: 'Ventas del mes', value: '$--', color: 'text-ink' },
    { label: 'Caja', value: stats.cajaAbierta ? 'Abierta' : 'Cerrada', color: stats.cajaAbierta ? 'text-success' : 'text-muted' },
  ]

  return (
    <PageLayout title="Inicio">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, index) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
          >
            <Card>
              <p className="text-sm text-muted">{card.label}</p>
              <p className={`text-2xl font-bold mt-1 font-mono ${card.color}`}>{card.value}</p>
            </Card>
          </motion.div>
        ))}
      </div>
    </PageLayout>
  )
}

function Placeholder({ title }: { title: string }) {
  return (
    <PageLayout title={title}>
      <Card className="p-12 text-center">
        <p className="text-muted text-sm">Próximamente...</p>
      </Card>
    </PageLayout>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-bg">
        <Sidebar />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/clientes" element={<ClientesPage />} />
          <Route path="/pases" element={<PasesPage />} />
          <Route path="/planes" element={<PlanesPage />} />
          <Route path="/pagos" element={<PagosPage />} />
          <Route path="/profesores" element={<ProfesoresPage />} />
          <Route path="/ventas" element={<Placeholder title="Ventas" />} />
          <Route path="/kiosco" element={<Placeholder title="Kiosco" />} />
          <Route path="/empleados" element={<Placeholder title="Empleados" />} />
          <Route path="/gastos" element={<Placeholder title="Gastos" />} />
          <Route path="/caja" element={<Placeholder title="Caja" />} />
          <Route path="/informes" element={<Placeholder title="Informes" />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
