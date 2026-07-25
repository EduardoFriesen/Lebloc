import { useEffect, useState } from 'react'
import { usePagoStore } from '../../stores/pagoStore'
import { PageLayout } from '../../components/layout/PageLayout'
import { Table } from '../../components/ui/Table'
import { Button } from '../../components/ui/Button'
import { PagoForm } from './PagoForm'
import { Pago } from '../../types'
import { formatCurrency, formatDateTime } from '../../lib/utils'

export function PagosPage() {
  const { pagos, fetchPagos, createPago } = usePagoStore()
  const [isFormOpen, setIsFormOpen] = useState(false)

  useEffect(() => { fetchPagos() }, [])

  const columns = [
    { key: 'fecha', header: 'Fecha', render: (p: Pago) => formatDateTime(p.fecha) },
    { key: 'clienteNombre', header: 'Cliente', render: (p: Pago) => <span className="font-medium">{p.clienteNombre}</span> },
    { key: 'monto', header: 'Monto', render: (p: Pago) => <span className="font-mono">{formatCurrency(p.monto)}</span> },
    { key: 'metodoPago', header: 'Metodo', render: (p: Pago) => <span className="capitalize">{p.metodoPago}</span> },
    { key: 'observaciones', header: 'Obs.' },
  ]

  const handleSubmit = async (data: any) => {
    await createPago(data)
    await fetchPagos()
  }

  return (
    <PageLayout title="Pagos" actions={<Button onClick={() => setIsFormOpen(true)}>+ Registrar Pago</Button>}>
      <Table columns={columns} data={pagos} emptyMessage="No hay pagos registrados." />
      <PagoForm isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} onSubmit={handleSubmit} />
    </PageLayout>
  )
}
