import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'
import { Button } from '../../components/ui/Button'
import { useClienteStore } from '../../stores/clienteStore'
import { usePaseStore } from '../../stores/paseStore'
import { motion } from 'framer-motion'

interface PlanFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: { clienteId: number; paseId: number; profesorId?: number }) => Promise<void>
}

export function PlanForm({ isOpen, onClose, onSubmit }: PlanFormProps) {
  const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm()
  const { clientes, fetchClientes } = useClienteStore()
  const { pases, fetchPases } = usePaseStore()
  const [selectedPase, setSelectedPase] = useState<any>(null)

  useEffect(() => {
    fetchClientes()
    fetchPases()
  }, [])

  const paseId = watch('paseId')

  useEffect(() => {
    if (paseId) {
      const pase = pases.find((p) => p.id === Number(paseId))
      setSelectedPase(pase)
    }
  }, [paseId, pases])

  const handleFormSubmit = async (data: any) => {
    await onSubmit({
      clienteId: Number(data.clienteId),
      paseId: Number(data.paseId),
      profesorId: data.profesorId ? Number(data.profesorId) : undefined,
    })
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Asignar Plan" size="md">
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        <Select label="Cliente" {...register('clienteId', { required: true })}>
          <option value="">Seleccionar cliente...</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>{c.apellido}, {c.nombre}</option>
          ))}
        </Select>

        <Select label="Tipo de Pase" {...register('paseId', { required: true })}>
          <option value="">Seleccionar pase...</option>
          {pases.filter((p) => !p.esDiario).map((p) => (
            <option key={p.id} value={p.id}>{p.nombre} - {p.clasesSemanales}x/sem</option>
          ))}
        </Select>

        {selectedPase && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="bg-bg rounded-lg p-4 text-sm"
          >
            <p className="text-muted">Pases al inicio: <span className="font-mono font-bold text-ink">{selectedPase.clasesSemanales * 4}</span></p>
            <p className="text-muted">Precio: <span className="font-mono font-bold text-ink">${selectedPase.precio}</span></p>
          </motion.div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button type="submit" disabled={isSubmitting}>Asignar Plan</Button>
        </div>
      </form>
    </Modal>
  )
}
