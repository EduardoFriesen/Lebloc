import { useEffect, useState } from 'react'
import { usePlanStore } from '../../stores/planStore'
import { PageLayout } from '../../components/layout/PageLayout'
import { Table } from '../../components/ui/Table'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { ConfirmDialog } from '../../components/shared/ConfirmDialog'
import { PlanForm } from './PlanForm'
import { AsistenciaButton } from './AsistenciaButton'
import { Plan } from '../../types'
import { formatDate, formatCurrency } from '../../lib/utils'

export function PlanesPage() {
  const { planes, fetchPlanes, createPlan, renovarPlan } = usePlanStore()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [renovarId, setRenovarId] = useState<number | null>(null)

  useEffect(() => { fetchPlanes() }, [])

  const columns = [
    { key: 'clienteNombre', header: 'Cliente', render: (p: Plan) => <span className="font-medium">{p.clienteNombre}</span> },
    { key: 'paseNombre', header: 'Pase' },
    { key: 'clasesSemanales', header: 'Clases/Sem', render: (p: Plan) => `${p.clasesSemanales}x` },
    { key: 'precio', header: 'Precio', render: (p: Plan) => formatCurrency(p.precio) },
    { key: 'pasesRestantes', header: 'Estado', render: (p: Plan) => <AsistenciaButton plan={p} /> },
    { key: 'fechaInicio', header: 'Inicio', render: (p: Plan) => formatDate(p.fechaInicio) },
    { key: 'actions', header: '', className: 'w-24', render: (p: Plan) => (
      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setRenovarId(p.id) }}>Renovar</Button>
    )},
  ]

  return (
    <PageLayout title="Planes" actions={<Button onClick={() => setIsFormOpen(true)}>+ Nuevo Plan</Button>}>
      <Table columns={columns} data={planes} emptyMessage="No hay planes activos." />
      <PlanForm isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} onSubmit={async (data) => { await createPlan(data) }} />
      <ConfirmDialog
        isOpen={renovarId !== null}
        onClose={() => setRenovarId(null)}
        onConfirm={() => { if (renovarId) renovarPlan(renovarId) }}
        title="Renovar Plan"
        message="Se creara un nuevo plan con los pases reiniciados."
        confirmLabel="Renovar"
      />
    </PageLayout>
  )
}
