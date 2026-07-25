import { useEffect, useState } from 'react'
import { useProfesorStore } from '../../stores/profesorStore'
import { PageLayout } from '../../components/layout/PageLayout'
import { Table } from '../../components/ui/Table'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/shared/ConfirmDialog'
import { ProfesorForm } from './ProfesorForm'
import { Profesor } from '../../types'

export function ProfesoresPage() {
  const { profesores, fetchProfesores, createProfesor, updateProfesor, deleteProfesor } = useProfesorStore()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editing, setEditing] = useState<Profesor | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => { fetchProfesores() }, [])

  const columns = [
    { key: 'apellido', header: 'Apellido', render: (p: Profesor) => <span className="font-medium">{p.apellido}</span> },
    { key: 'nombre', header: 'Nombre' },
    { key: 'telefono', header: 'Telefono' },
    { key: 'email', header: 'Email' },
    { key: 'actions', header: '', className: 'w-32', render: (p: Profesor) => (
      <div className="flex gap-1 justify-end">
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditing(p); setIsFormOpen(true) }}>Editar</Button>
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDeletingId(p.id) }}>Eliminar</Button>
      </div>
    )},
  ]

  return (
    <PageLayout title="Profesores" actions={<Button onClick={() => { setEditing(null); setIsFormOpen(true) }}>+ Nuevo Profesor</Button>}>
      <Table columns={columns} data={profesores} onRowClick={(p) => { setEditing(p); setIsFormOpen(true) }} emptyMessage="No hay profesores registrados." />
      <ProfesorForm isOpen={isFormOpen} onClose={() => { setIsFormOpen(false); setEditing(null) }} profesor={editing} onSubmit={editing ? (d) => updateProfesor(editing.id, d) : (d) => createProfesor(d).then(() => {})} />
      <ConfirmDialog isOpen={deletingId !== null} onClose={() => setDeletingId(null)} onConfirm={() => { if (deletingId) deleteProfesor(deletingId) }} title="Eliminar Profesor" message="Esta accion desactivara al profesor." confirmLabel="Eliminar" variant="danger" />
    </PageLayout>
  )
}
