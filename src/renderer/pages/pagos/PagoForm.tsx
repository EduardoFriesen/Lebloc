import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Button } from '../../components/ui/Button'
import { usePlanStore } from '../../stores/planStore'
import { dbQuery } from '../../lib/db'
import { motion } from 'framer-motion'

interface PagoFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: any) => Promise<void>
}

export function PagoForm({ isOpen, onClose, onSubmit }: PagoFormProps) {
  const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm()
  const { planes, fetchPlanes } = usePlanStore()
  const [deudaInfo, setDeudaInfo] = useState<{ total: number; pagado: number; pendiente: number } | null>(null)

  useEffect(() => { fetchPlanes() }, [])

  const planId = watch('planId')

  useEffect(() => {
    if (planId) {
      const plan = planes.find((p) => p.id === Number(planId))
      if (plan) {
        const fetchDeuda = async () => {
          const result = await dbQuery('SELECT COALESCE(SUM(monto), 0) as totalPagado FROM pagos WHERE planId = ?', [plan.id])
          const pagado = result[0]?.totalPagado || 0
          setDeudaInfo({ total: plan.precio, pagado, pendiente: plan.precio - pagado })
        }
        fetchDeuda()
      }
    }
  }, [planId, planes])

  const handleFormSubmit = async (data: any) => {
    await onSubmit({
      planId: Number(data.planId),
      monto: Number(data.monto),
      metodoPago: data.metodoPago,
      observaciones: data.observaciones,
    })
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Registrar Pago" size="md">
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        <Select label="Plan" {...register('planId', { required: true })}>
          <option value="">Seleccionar plan...</option>
          {planes.map((p) => (
            <option key={p.id} value={p.id}>{p.clienteNombre} - {p.paseNombre}</option>
          ))}
        </Select>

        {deudaInfo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="bg-bg rounded-lg p-4 text-sm space-y-1"
          >
            <p className="text-muted">Total: <span className="font-mono font-bold text-ink">${deudaInfo.total}</span></p>
            <p className="text-muted">Pendiente: <span className="font-mono font-bold text-warning">${deudaInfo.pendiente}</span></p>
          </motion.div>
        )}

        <Input label="Monto" type="number" min="0" step="0.01" {...register('monto', { required: true })} />

        <Select label="Metodo de Pago" {...register('metodoPago', { required: true })}>
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
          <option value="tarjeta">Tarjeta</option>
        </Select>

        <Input label="Observaciones" {...register('observaciones')} />

        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button type="submit" disabled={isSubmitting}>Registrar Pago</Button>
        </div>
      </form>
    </Modal>
  )
}
