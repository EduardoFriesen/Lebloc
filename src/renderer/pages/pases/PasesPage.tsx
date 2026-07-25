import { useEffect, useState } from 'react'
import { usePaseStore } from '../../stores/paseStore'
import { PageLayout } from '../../components/layout/PageLayout'
import { Table } from '../../components/ui/Table'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { ConfirmDialog } from '../../components/shared/ConfirmDialog'
import { PaseForm } from './PaseForm'
import { Pase } from '../../types'
import { formatCurrency } from '../../lib/utils'

export function PasesPage() {
  const { pases, fetchPases, createPase, updatePase, deletePase } = usePaseStore()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingPase, setEditingPase] = useState<Pase | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => { fetchPases() }, [])

  const columns = [
    { key: 'nombre', header: 'Nombre', render: (p: Pase) => (
      <div className="flex items-center gap-2">
        <span className="font-medium">{p.nombre}</span>
        {p.esDiario ? <Badge>Diario</Badge> : null}
      </div>
    )},
    { key: 'clasesSemanales', header: 'Clases/Sem', render: (p: Pase) => p.esDiario ? '-' : `${p.clasesSemanales}x` },
    { key: 'precio', header: 'Precio', render: (p: Pase) => formatCurrency(p.precio) },
    { key: 'recargoProfesor', header: 'Recargo Prof.', render: (p: Pase) => p.recargoProfesor > 0 ? formatCurrency(p.recargoProfesor) : '-' },
    { key: 'actions', header: '', className: 'w-32', render: (p: Pase) => (
      <div className="flex gap-1 justify-end">
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditingPase(p); setIsFormOpen(true) }}>Editar</Button>
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDeletingId(p.id) }}>Eliminar</Button>
      </div>
    )},
  ]

  return (
    <PageLayout title="Pases" actions={<Button onClick={() => { setEditingPase(null); setIsFormOpen(true) }}>+ Nuevo Pase</Button>}>
      <Table columns={columns} data={pases} onRowClick={(p) => { setEditingPase(p); setIsFormOpen(true) }} emptyMessage="No hay pases configurados. Crea el primero." />
      <PaseForm isOpen={isFormOpen} onClose={() => { setIsFormOpen(false); setEditingPase(null) }} pase={editingPase} onSubmit={editingPase ? (d) => updatePase(editingPase.id, d) : async (d) => { await createPase(d) }} />
      <ConfirmDialog isOpen={deletingId !== null} onClose={() => setDeletingId(null)} onConfirm={() => { if (deletingId) deletePase(deletingId) }} title="Eliminar Pase" message="Esta acción desactivará el pase." confirmLabel="Eliminar" variant="danger" />
    </PageLayout>
  )
}
