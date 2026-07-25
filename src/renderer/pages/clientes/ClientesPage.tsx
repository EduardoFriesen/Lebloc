import { useEffect, useState } from 'react'
import { useClienteStore } from '../../stores/clienteStore'
import { PageLayout } from '../../components/layout/PageLayout'
import { Table } from '../../components/ui/Table'
import { Button } from '../../components/ui/Button'
import { SearchInput } from '../../components/shared/SearchInput'
import { Badge } from '../../components/ui/Badge'
import { ConfirmDialog } from '../../components/shared/ConfirmDialog'
import { ClienteForm } from './ClienteForm'
import { Cliente } from '../../types'
import { formatDate } from '../../lib/utils'

export function ClientesPage() {
  const { clientes, search, setSearch, fetchClientes, createCliente, updateCliente, deleteCliente } = useClienteStore()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => { fetchClientes() }, [search])

  const columns = [
    { key: 'dni', header: 'DNI', className: 'font-mono' },
    { key: 'nombre', header: 'Nombre' },
    { key: 'apellido', header: 'Apellido' },
    { key: 'telefono', header: 'Teléfono' },
    {
      key: 'activo', header: 'Estado',
      render: (c: Cliente) => (
        <Badge variant={c.activo ? 'success' : 'default'}>
          {c.activo ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
    {
      key: 'actions', header: '', className: 'w-32',
      render: (c: Cliente) => (
        <div className="flex gap-1 justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); setEditingCliente(c); setIsFormOpen(true) }}
          >
            Editar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); setDeletingId(c.id) }}
          >
            Eliminar
          </Button>
        </div>
      ),
    },
  ]

  return (
    <PageLayout
      title="Clientes"
      actions={
        <Button onClick={() => { setEditingCliente(null); setIsFormOpen(true) }}>
          + Nuevo Cliente
        </Button>
      }
    >
      <div className="mb-4">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, apellido o DNI..."
        />
      </div>

      <div className="overflow-x-auto">
        <Table
          columns={columns}
          data={clientes}
          onRowClick={(c) => { setEditingCliente(c); setIsFormOpen(true) }}
          emptyMessage="No hay clientes registrados. Crea el primero."
        />
      </div>

      <ClienteForm
        isOpen={isFormOpen}
        onClose={() => { setIsFormOpen(false); setEditingCliente(null) }}
        cliente={editingCliente}
        onSubmit={editingCliente ? (d) => updateCliente(editingCliente.id, d) : async (d) => { await createCliente(d) }}
      />

      <ConfirmDialog
        isOpen={deletingId !== null}
        onClose={() => setDeletingId(null)}
        onConfirm={() => { if (deletingId) deleteCliente(deletingId) }}
        title="Eliminar Cliente"
        message="Esta acción desactivará el cliente. No se eliminará permanentemente."
        confirmLabel="Eliminar"
        variant="danger"
      />
    </PageLayout>
  )
}
