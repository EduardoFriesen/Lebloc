import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/layout/Sidebar'
import { PageLayout } from './components/layout/PageLayout'
import { Card } from './components/ui/Card'
import { motion } from 'framer-motion'
import { ClientesPage } from './pages/clientes/ClientesPage'
import { PasesPage } from './pages/pases/PasesPage'
import { PlanesPage } from './pages/planes/PlanesPage'
import { PagosPage } from './pages/pagos/PagosPage'

function Dashboard() {
  const stats = [
    { label: 'Clientes activos', value: '--' },
    { label: 'Planes activos', value: '--' },
    { label: 'Ventas del mes', value: '$--' },
    { label: 'Caja abierta', value: '--' },
  ]

  return (
    <PageLayout title="Inicio">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
          >
            <Card>
              <p className="text-sm text-muted">{stat.label}</p>
              <p className="text-2xl font-bold text-ink mt-1 font-mono">{stat.value}</p>
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
          <Route path="/profesores" element={<Placeholder title="Profesores" />} />
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
